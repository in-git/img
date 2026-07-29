import sys
import os
# 添加本地 site-packages 路径
local_pkg = r"e:\git\img\venv\Lib\site-packages"
if os.path.exists(local_pkg) and local_pkg not in sys.path:
    sys.path.insert(0, local_pkg)

import io
import time
import urllib.parse
import zipfile
import asyncio
from typing import List, Optional, Dict
from concurrent.futures import ProcessPoolExecutor, TimeoutError

from fastapi import FastAPI, Request, Form, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image
from rembg import remove

app = FastAPI(title="Image Processing API")

# 全局存储 SSE 客户端连接队列: { client_id: asyncio.Queue }
sse_clients: Dict[str, asyncio.Queue] = {}

# 全局进程池：用于隔离 rembg 抠图（CPU/GPU密集型操作），避免阻塞主事件循环
# Python 的进程隔离对应 Node.js 的 child_process.fork
process_pool = ProcessPoolExecutor()


# ----------------------------------------------------------------------
# 辅助函数：跨进程跑 AI 抠图 (带 30 秒超时降级)
# ----------------------------------------------------------------------
def _remove_bg_task(input_bytes: bytes) -> bytes:
    """在独立进程中跑背景擦除"""
    return remove(input_bytes)


async def run_remove_bg_in_subprocess(input_bytes: bytes, timeout: float = 30.0) -> bytes:
    """超时防护：超过指定时间则强制取消并降级使用原图"""
    loop = asyncio.get_running_loop()
    try:
        # 将同步的 rembg 丢进进程池异步执行
        result = await asyncio.wait_for(
            loop.run_in_executor(process_pool, _remove_bg_task, input_bytes),
            timeout=timeout
        )
        return result
    except asyncio.TimeoutError:
        print("[警告] 抠图子进程超时被强制终止，自动降级使用原图")
        return input_bytes
    except Exception as e:
        print(f"[警告] 抠图过程出错: {e}")
        return input_bytes


# ----------------------------------------------------------------------
# 辅助函数：去水印处理任务
# ----------------------------------------------------------------------
def _remove_watermark_task(input_bytes: bytes) -> bytes:
    """去除水印任务钩子，可配置具体的去水印模型或算法"""
    # 目前保留处理逻辑占位，后续可拓展 OpenCV/Inpainting 消除算法
    return input_bytes


# ----------------------------------------------------------------------
# 辅助函数：推送 SSE 消息
# ----------------------------------------------------------------------
async def send_progress(client_id: str, current: int, total: int, message: str):
    queue = sse_clients.get(client_id)
    if queue:
        payload = {
            "current": current,
            "total": total,
            "message": message,
            "timestamp": int(time.time() * 1000)
        }
        await queue.put(payload)


# ----------------------------------------------------------------------
# 1. SSE 进度推送接口
# ----------------------------------------------------------------------
@app.get("/api/progress")
async def sse_progress(request: Request, clientId: str = "default"):
    async def event_generator():
        queue = asyncio.Queue()
        sse_clients[clientId] = queue
        print(f"[SSE] 客户端 {clientId} 已连接，当前连接数: {len(sse_clients)}")
        try:
            while True:
                # 检测客户端断开
                if await request.is_disconnected():
                    break
                data = await queue.get()
                import json
                yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
        finally:
            sse_clients.pop(clientId, None)
            print(f"[SSE] 客户端 {clientId} 已断开，当前连接数: {len(sse_clients)}")

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    })


# ----------------------------------------------------------------------
# 2. 综合图像处理接口
# ----------------------------------------------------------------------
@app.post("/api/remove-bg-batch")
async def remove_bg_batch(
    images: List[UploadFile] = File(...),
    clientId: str = Form("default"),
    removeBg: str = Form("true"),
    removeWatermark: str = Form("false"),
    format: str = Form("png"),
    quality: int = Form(100),
    scale: int = Form(100)
):
    try:
        if not images or len(images) == 0:
            raise HTTPException(status_code=400, detail="未上传图片文件")

        # 参数解构与转换
        is_remove_bg = removeBg.lower() != "false"
        is_remove_watermark = removeWatermark.lower() != "false"
        target_format = format.lower()
        total_files = len(images)

        print(f"[日志] 收到 {total_files} 张图片任务 | 智能抠图: {is_remove_bg} | 去除水印: {is_remove_watermark} | 目标格式: {target_format} | 压缩质量: {quality}% | 缩放比例: {scale}% | 客户端: {clientId}")

        await send_progress(clientId, 0, total_files, "开始处理...")

        processed_results = []

        # 串行队列处理
        for index, file in enumerate(images):
            # Python 的 FastAPI/Starlette 会自动对文件名编码进行 UTF-8 纠正
            safe_file_name = file.filename or f"image_{index + 1}.png"

            print(f"[日志] 正在处理第 ({index + 1}/{total_files}) 张: {safe_file_name}")
            await send_progress(clientId, index, total_files, f"正在处理第 {index + 1} 张: {safe_file_name}")

            try:
                input_bytes = await file.read()

                # 1. 去除水印处理
                if is_remove_watermark:
                    input_bytes = _remove_watermark_task(input_bytes)

                # 2. AI 背景擦除 (通过 ProcessPoolExecutor 隔离执行)
                if is_remove_bg:
                    input_bytes = await run_remove_bg_in_subprocess(input_bytes)

                # 3. Pillow 图像尺寸缩放与格式转换
                with Image.open(io.BytesIO(input_bytes)) as img:
                    # 缩放处理
                    if scale < 100:
                        new_width = max(1, int(img.width * (scale / 100.0)))
                        new_height = max(1, int(img.height * (scale / 100.0)))
                        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

                    output_io = io.BytesIO()

                    # 格式处理与质量控制
                    if target_format in ["jpg", "jpeg"]:
                        mime_type = "image/jpeg"
                        # JPG 不支持透明度，铺一层白色背景 (对应 Sharp .flatten())
                        if img.mode in ("RGBA", "LA", "P"):
                            background = Image.new("RGB", img.size, (255, 255, 255))
                            background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                            img = background
                        else:
                            img = img.convert("RGB")
                        
                        img.save(output_io, format="JPEG", quality=quality)

                    elif target_format == "webp":
                        mime_type = "image/webp"
                        img.save(output_io, format="WEBP", quality=quality)

                    else:  # png
                        mime_type = "image/png"
                        # Python Pillow 针对 PNG compress_level 范围是 0~9
                        # node.js 中: Math.floor((100 - quality) / 10)
                        compress_level = max(0, min(9, (100 - quality) // 10))
                        img.save(output_io, format="PNG", compress_level=compress_level)

                    final_bytes = output_io.getvalue()

                # 确定输出文件名
                raw_name = safe_file_name.rsplit('.', 1)[0] or f"image_{index + 1}"
                ext = "jpg" if target_format == "jpg" else target_format
                output_name = f"{raw_name}_processed.{ext}"

                processed_results.append({
                    "output_name": output_name,
                    "buffer": final_bytes,
                    "mime_type": mime_type
                })

            except Exception as single_err:
                print(f"[错误] 处理文件 {safe_file_name} 失败: {single_err}")

        print(f"[日志] 全部图像处理完成！成功完成 {len(processed_results)} 张")
        await send_progress(clientId, total_files, total_files, f"处理完成！成功 {len(processed_results)} 张")

        if len(processed_results) == 0:
            raise HTTPException(status_code=500, detail="所有图片处理均失败，请检查文件格式")

        # 打包逻辑处理
        if len(processed_results) > 1:
            # 多个文件返回 ZIP 压缩包
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for item in processed_results:
                    zip_file.writestr(item["output_name"], item["buffer"])

            zip_buffer.seek(0)
            zip_bytes = zip_buffer.getvalue()

            encoded_zip_name = urllib.parse.quote(f"{len(processed_results)}个图片.zip")
            headers = {
                "X-Processed-Count": str(len(processed_results)),
                "Content-Disposition": f"attachment; filename=\"{encoded_zip_name}\"; filename*=UTF-8''{encoded_zip_name}"
            }
            return Response(content=zip_bytes, media_type="application/zip", headers=headers)

        else:
            # 单张图直接返回流文件
            single = processed_results[0]
            encoded_name = urllib.parse.quote(single["output_name"])
            headers = {
                "Content-Disposition": f"attachment; filename=\"{encoded_name}\"; filename*=UTF-8''{encoded_name}"
            }
            return Response(content=single["buffer"], media_type=single["mime_type"], headers=headers)

    except Exception as error:
        print(f"[报错] 接口整体处理异常: {error}")
        raise HTTPException(status_code=500, detail="后端处理过程出错，请重试")


# ----------------------------------------------------------------------
# 静态托管前端页面（对应 Node.js 中的 app.use(express.static('public'))）
# 确保在根目录建一个 public 文件夹
# ----------------------------------------------------------------------
try:
    app.mount("/", StaticFiles(directory="public", html=True), name="public")
except RuntimeError:
    print("[提示] 找不到 public 目录，请创建 public 文件夹并放置前端 HTML/CSS 文件。")

# ----------------------------------------------------------------------
# 启动脚本
# ----------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    PORT = 3100
    print("=================================")
    print(f"服务启动成功: http://localhost:{PORT}")
    print("=================================")
    uvicorn.run(app, host="0.0.0.0", port=PORT, reload=False)