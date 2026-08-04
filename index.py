import sys
import os
# 添加本地 site-packages 路径（自动适配 Windows / Linux）[cite: 1]
_venv_base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'venv')
if os.name == 'nt':
    local_pkg = os.path.join(_venv_base, 'Lib', 'site-packages')
else:
    # Linux: 兼容 python3.x[cite: 1]
    import glob
    _matches = glob.glob(os.path.join(_venv_base, 'lib', 'python3*', 'site-packages'))
    local_pkg = _matches[0] if _matches else os.path.join(_venv_base, 'lib', 'python3', 'site-packages')
if os.path.exists(local_pkg) and local_pkg not in sys.path:
    sys.path.insert(0, local_pkg)

import io
import time
import urllib.parse
import zipfile
import asyncio
from typing import List, Dict
from concurrent.futures import ProcessPoolExecutor

from fastapi import FastAPI, Request, Form, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image
from rembg import remove

import cv2
import numpy as np

app = FastAPI(title="Image Processing API")

# 全局存储 SSE 客户端连接队列: { client_id: asyncio.Queue }[cite: 1]
sse_clients: Dict[str, asyncio.Queue] = {}

# 全局停止标志: { client_id: bool }[cite: 1]
stop_flags: Dict[str, bool] = {}

# 全局进程池：用于隔离 CPU/GPU 密集型操作，避免阻塞主事件循环[cite: 1]
process_pool = ProcessPoolExecutor()


# ----------------------------------------------------------------------
# 辅助函数：跨进程跑 AI 抠图 (带 30 秒超时降级)[cite: 1]
# ----------------------------------------------------------------------
def _remove_bg_task(input_bytes: bytes) -> bytes:
    """在独立进程中跑背景擦除"""
    return remove(input_bytes)


async def run_remove_bg_in_subprocess(input_bytes: bytes, timeout: float = 30.0) -> bytes:
    """超时防护：超过指定时间则强制取消并降级使用原图"""
    loop = asyncio.get_running_loop()
    try:
        # 将同步的 rembg 丢进进程池异步执行[cite: 1]
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
# 辅助函数：优化版去水印处理任务 (专攻豆包等右下角半透明水印)
# ----------------------------------------------------------------------
def _remove_watermark_task(input_bytes: bytes) -> bytes:
    """去除水印任务：限制在右下角区域检测并使用形态学算法提取水印"""
    try:
        # 1. 将图片字节流解码为 OpenCV 图像矩阵 (BGR 格式)[cite: 1]
        nparr = np.frombuffer(input_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return input_bytes

        height, width = img.shape[:2]

        # 2. 限定右下角 ROI 区域（豆包水印通常在画面极右下角：宽度后 25%，高度后 15%）
        roi_x_start = int(width * 0.75)
        roi_y_start = int(height * 0.85)
        roi = img[roi_y_start:height, roi_x_start:width]

        # 3. 在 ROI 区域内转换灰度[cite: 1]
        gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)

        # 4. 形态学运算提取水印（完美适配半透明文本与图标）
        # 使用较大的矩形核来估算背景光照
        rect_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        
        # Top-Hat 变换：提取暗背景上的亮色水印（如发白/半透明字）
        tophat = cv2.morphologyEx(gray_roi, cv2.MORPH_TOPHAT, rect_kernel)
        # Black-Hat 变换：提取亮背景上的暗色水印（如深灰色字）
        blackhat = cv2.morphologyEx(gray_roi, cv2.MORPH_BLACKHAT, rect_kernel)
        
        # 融合亮色和暗色特征
        combined_hat = cv2.add(tophat, blackhat)

        # 对提取出的特征进行二值化（动态分离水印与平滑背景）
        _, roi_mask = cv2.threshold(combined_hat, 15, 255, cv2.THRESH_BINARY)

        # 5. 形态学膨胀处理：连接断开的字体笔画并覆盖边缘[cite: 1]
        # 使用稍小的核，防止过度膨胀导致画面模糊
        kernel = np.ones((3, 3), np.uint8)
        roi_mask = cv2.dilate(roi_mask, kernel, iterations=1)

        # 6. 将 ROI 掩膜贴回与原图大小一致的全图 Mask 中[cite: 1]
        full_mask = np.zeros((height, width), dtype=np.uint8)
        full_mask[roi_y_start:height, roi_x_start:width] = roi_mask

        # 7. 仅针对右下角生成的 Mask 区域进行 Inpainting 图像修复[cite: 1]
        result_img = cv2.inpaint(img, full_mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)

        # 8. 编码回 PNG 格式字节流[cite: 1]
        success, encoded_img = cv2.imencode(".png", result_img)
        if success:
            return encoded_img.tobytes()
        return input_bytes
    except Exception as e:
        print(f"[警告] 去水印处理出错: {e}")
        return input_bytes


async def run_remove_watermark_in_subprocess(input_bytes: bytes, timeout: float = 15.0) -> bytes:
    """跨进程异步执行去水印任务"""
    loop = asyncio.get_running_loop()
    try:
        result = await asyncio.wait_for(
            loop.run_in_executor(process_pool, _remove_watermark_task, input_bytes),
            timeout=timeout
        )
        return result
    except asyncio.TimeoutError:
        print("[警告] 去水印处理超时，降级返回原图")
        return input_bytes
    except Exception as e:
        print(f"[警告] 去水印异步任务失败: {e}")
        return input_bytes


# ----------------------------------------------------------------------
# 辅助函数：推送 SSE 消息[cite: 1]
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
# 1. SSE 进度推送接口[cite: 1]
# ----------------------------------------------------------------------
@app.get("/api/progress")
async def sse_progress(request: Request, clientId: str = "default"):
    async def event_generator():
        queue = asyncio.Queue()
        sse_clients[clientId] = queue
        print(f"[SSE] 客户端 {clientId} 已连接，当前连接数: {len(sse_clients)}")
        try:
            while True:
                # 检测客户端断开[cite: 1]
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
# 停止渲染接口[cite: 1]
# ----------------------------------------------------------------------
@app.post("/api/stop-render")
async def stop_render(request: Request):
    try:
        body = await request.json()
        client_id = body.get("clientId")
        if client_id:
            stop_flags[client_id] = True
            print(f"[日志] 收到客户端 {client_id} 的停止请求")
            return {"success": True, "message": "已发送停止信号"}
        else:
            raise HTTPException(status_code=400, detail="缺少 clientId 参数")
    except Exception as e:
        print(f"[错误] 停止渲染请求失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ----------------------------------------------------------------------
# 2. 综合图像处理接口[cite: 1]
# ----------------------------------------------------------------------
@app.post("/api/remove-bg-batch")
async def remove_bg_batch(
    images: List[UploadFile] = File(...),
    clientId: str = Form("default"),
    removeBg: str = Form("true"),
    removeWatermark: str = Form("false"),
    format: str = Form("png"),
    quality: int = Form(100),
    scale: str = Form("100"),
    scaleMode: str = Form("percent")
):
    try:
        if not images or len(images) == 0:
            raise HTTPException(status_code=400, detail="未上传图片文件")

        # 参数解构与转换[cite: 1]
        is_remove_bg = removeBg.lower() != "false"
        is_remove_watermark = removeWatermark.lower() != "false"
        target_format = format.lower()
        total_files = len(images)

        # 解析 scale 参数：依据 scaleMode 区分像素模式与百分比模式[cite: 1]
        scale_value = 100
        scale_width = None
        scale_height = None
        if scaleMode == "px":
            # 像素尺寸模式（如 "1920x1080"、"autox1080"、"1920xauto"）[cite: 1]
            if 'x' in scale:
                parts = scale.split('x')
                if parts[0] and parts[0] != 'auto':
                    scale_width = int(parts[0])
                if len(parts) > 1 and parts[1] and parts[1] != 'auto':
                    scale_height = int(parts[1])
            else:
                # px 模式但未带 x，视为单值宽度等比缩放[cite: 1]
                if scale.isdigit():
                    scale_width = int(scale)
        else:
            # 百分比模式（如 "80"）[cite: 1]
            scale_value = int(scale) if scale.isdigit() else 100

        print(f"[日志] 收到 {total_files} 张图片任务 | 智能抠图: {is_remove_bg} | 去除水印: {is_remove_watermark} | 目标格式: {target_format} | 压缩质量: {quality}% | 缩放模式: {scaleMode} | 缩放值: {scale} | 客户端: {clientId}")

        await send_progress(clientId, 0, total_files, "开始处理...")

        # 初始化该客户端的停止标志[cite: 1]
        stop_flags[clientId] = False

        processed_results = []

        # 串行队列处理[cite: 1]
        for index, file in enumerate(images):
            # 检查停止标志[cite: 1]
            if stop_flags.get(clientId, False):
                print(f"[日志] 客户端 {clientId} 请求停止，已处理 {index} 张后终止")
                await send_progress(clientId, index, total_files, f"已停止渲染，已处理 {index} 张")
                break

            # Python 的 FastAPI/Starlette 会自动对文件名编码进行 UTF-8 纠正[cite: 1]
            safe_file_name = file.filename or f"image_{index + 1}.png"

            print(f"[日志] 正在处理第 ({index + 1}/{total_files}) 张: {safe_file_name}")
            await send_progress(clientId, index, total_files, f"正在处理第 {index + 1} 张: {safe_file_name}")

            try:
                input_bytes = await file.read()

                # 1. 去除水印处理 (放到进程池异步执行，防阻塞)[cite: 1]
                if is_remove_watermark:
                    input_bytes = await run_remove_watermark_in_subprocess(input_bytes)

                # 检查停止标志（在水印处理后）[cite: 1]
                if stop_flags.get(clientId, False):
                    print(f"[日志] 客户端 {clientId} 请求停止，已处理 {index} 张后终止")
                    await send_progress(clientId, index, total_files, f"已停止渲染，已处理 {index} 张")
                    break

                # 2. AI 背景擦除 (通过 ProcessPoolExecutor 隔离执行)[cite: 1]
                if is_remove_bg:
                    input_bytes = await run_remove_bg_in_subprocess(input_bytes)

                # 检查停止标志（在抠图处理后）[cite: 1]
                if stop_flags.get(clientId, False):
                    print(f"[日志] 客户端 {clientId} 请求停止，已处理 {index} 张后终止")
                    await send_progress(clientId, index, total_files, f"已停止渲染，已处理 {index} 张")
                    break

                # 3. Pillow 图像尺寸缩放与格式转换[cite: 1]
                with Image.open(io.BytesIO(input_bytes)) as img:
                    # 缩放处理：支持百分比和像素尺寸[cite: 1]
                    if scale_width is not None or scale_height is not None:
                        # 像素尺寸模式[cite: 1]
                        orig_width, orig_height = img.size
                        if scale_width and scale_height:
                            new_width, new_height = scale_width, scale_height
                        elif scale_width:
                            # 按宽度等比缩放[cite: 1]
                            ratio = scale_width / orig_width
                            new_width, new_height = scale_width, max(1, int(orig_height * ratio))
                        else:
                            # 按高度等比缩放[cite: 1]
                            ratio = scale_height / orig_height
                            new_width, new_height = max(1, int(orig_width * ratio)), scale_height
                        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
                    elif scale_value < 100:
                        # 百分比模式[cite: 1]
                        new_width = max(1, int(img.width * (scale_value / 100.0)))
                        new_height = max(1, int(img.height * (scale_value / 100.0)))
                        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

                    output_io = io.BytesIO()

                    # 格式处理与质量控制[cite: 1]
                    if target_format in ["jpg", "jpeg"]:
                        mime_type = "image/jpeg"
                        # JPG 不支持透明度，铺一层白色背景 (对应 Sharp .flatten())[cite: 1]
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

                    elif target_format == "ico":
                        mime_type = "image/x-icon"
                        # ICO 支持透明通道，统一转为 RGBA 以保证兼容性[cite: 1]
                        if img.mode != "RGBA":
                            img = img.convert("RGBA")
                        img.save(output_io, format="ICO")

                    else:  # png
                        mime_type = "image/png"
                        # Python Pillow 针对 PNG compress_level 范围是 0~9[cite: 1]
                        # node.js 中: Math.floor((100 - quality) / 10)[cite: 1]
                        compress_level = max(0, min(9, (100 - quality) // 10))
                        img.save(output_io, format="PNG", compress_level=compress_level)

                    final_bytes = output_io.getvalue()

                # 确定输出文件名[cite: 1]
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

        # 打包逻辑处理[cite: 1]
        if len(processed_results) > 1:
            # 多个文件返回 ZIP 压缩包[cite: 1]
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
                for item in processed_results:
                    zip_file.writestr(item["output_name"], item["buffer"])

            zip_buffer.seek(0)
            zip_bytes = zip_buffer.getvalue()

            # 清理停止标志[cite: 1]
            stop_flags[clientId] = False

            encoded_zip_name = urllib.parse.quote(f"{len(processed_results)}个图片.zip")
            headers = {
                "X-Processed-Count": str(len(processed_results)),
                "Content-Disposition": f"attachment; filename=\"{encoded_zip_name}\"; filename*=UTF-8''{encoded_zip_name}"
            }
            return Response(content=zip_bytes, media_type="application/zip", headers=headers)

        else:
            # 清理停止标志[cite: 1]
            stop_flags[clientId] = False

            # 单张图直接返回流文件[cite: 1]
            single = processed_results[0]
            encoded_name = urllib.parse.quote(single["output_name"])
            headers = {
                "Content-Disposition": f"attachment; filename=\"{encoded_name}\"; filename*=UTF-8''{encoded_name}"
            }
            return Response(content=single["buffer"], media_type=single["mime_type"], headers=headers)

    except Exception as error:
        print(f"[报错] 接口整体处理异常: {error}")
        # 清理停止标志[cite: 1]
        if clientId in stop_flags:
            stop_flags[clientId] = False
        raise HTTPException(status_code=500, detail="后端处理过程出错，请重试")


# ----------------------------------------------------------------------
# 静态托管前端页面[cite: 1]
# ----------------------------------------------------------------------
try:
    app.mount("/", StaticFiles(directory="public", html=True), name="public")
except RuntimeError:
    print("[提示] 找不到 public 目录，请创建 public 文件夹并放置前端 HTML/CSS 文件。")

# ----------------------------------------------------------------------
# 启动脚本[cite: 1]
# ----------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    PORT = 3100
    print("=================================")
    print(f"服务启动成功: http://localhost:{PORT}")
    print("=================================")
    uvicorn.run(app, host="0.0.0.0", port=PORT, reload=False)