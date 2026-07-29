const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const JSZip = require('jszip');
const path = require('path');
const { fork } = require('child_process');

const router = express.Router();

// 存储每个客户端的 SSE 响应对象
const clients = new Map();

/**
 * SSE 进度推送接口
 */
router.get('/progress', (req, res) => {
    const clientId = req.query.clientId || 'default';

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.set(clientId, res);
    console.log(`[SSE] 客户端 ${clientId} 已连接，当前连接数: ${clients.size}`);

    req.on('close', () => {
        clients.delete(clientId);
        console.log(`[SSE] 客户端 ${clientId} 已断开，当前连接数: ${clients.size}`);
    });
});

/**
 * 发送进度给指定客户端
 */
function sendProgress(clientId, current, total, message) {
    const res = clients.get(clientId);
    if (res && !res.writableEnded) {
        const data = JSON.stringify({ current, total, message, timestamp: Date.now() });
        res.write(`data: ${data}\n\n`);
    }
}

// 使用内存存储
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 } // 单张限制 25MB
});

/**
 * 修复中文文件名乱码
 */
function fixFileNameEncoding(originalName) {
    try {
        return Buffer.from(originalName, 'latin1').toString('utf8');
    } catch (e) {
        return originalName;
    }
}

/**
 * 在独立子进程中跑 AI 抠图，规避 C++ 原生库 (GLib/GObject) 在主进程中的冲突
 */
function runRemoveBgInSubprocess(inputBuffer) {
    return new Promise((resolve) => {
        const workerPath = path.join(__dirname, '..', 'bg-worker.js');
        const worker = fork(workerPath);

        // 超时防护：30秒不返回强制杀死子进程
        const timer = setTimeout(() => {
            worker.kill();
            console.error('[警告] 抠图子进程超时被强制终止，自动降级使用原图');
            resolve(inputBuffer);
        }, 30000);

        worker.on('message', (message) => {
            clearTimeout(timer);
            worker.kill(); // 任务完成，杀死子进程彻底释放 C++ 句柄和内存
            if (message.success) {
                resolve(Buffer.from(message.bufferArray));
            } else {
                console.error('[警告] 抠图子进程出错:', message.error);
                resolve(inputBuffer); // 失败回退回原 Buffer
            }
        });

        worker.on('error', (err) => {
            clearTimeout(timer);
            worker.kill();
            console.error('[错误] 抠图子进程发生异常:', err);
            resolve(inputBuffer);
        });

        // 发送 Buffer 数据给子进程
        worker.send({ bufferArray: Array.from(new Uint8Array(inputBuffer)) });
    });
}

/**
 * 综合图像处理接口
 */
router.post('/remove-bg-batch', upload.array('images', 20), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '未上传图片文件' });
        }

        const clientId = req.body.clientId || 'default';
        const removeBg = req.body.removeBg !== 'false';
        const format = req.body.format || 'png';
        const quality = parseInt(req.body.quality) || 100;
        const scale = parseInt(req.body.scale) || 100;
        const totalFiles = req.files.length;

        console.log(`[日志] 收到 ${totalFiles} 张图片任务 | 智能抠图: ${removeBg} | 目标格式: ${format} | 压缩质量: ${quality}% | 缩放比例: ${scale}% | 客户端: ${clientId}`);

        // 发送开始进度
        sendProgress(clientId, 0, totalFiles, '开始处理...');

        const processedResults = [];

        // 串行队列处理
        for (let index = 0; index < totalFiles; index++) {
            const file = req.files[index];
            const safeFileName = fixFileNameEncoding(file.originalname);

            console.log(`[日志] 正在处理第 (${index + 1}/${totalFiles}) 张: ${safeFileName}`);
            sendProgress(clientId, index, totalFiles, `正在处理第 ${index + 1} 张: ${safeFileName}`);

            try {
                let inputBuffer = file.buffer;

                // 1. AI 背景擦除 (通过独立子进程隔离执行)
                if (removeBg) {
                    inputBuffer = await runRemoveBgInSubprocess(file.buffer);
                }

                // 2. sharp 图像尺寸与格式转换
                let sharpInstance = sharp(inputBuffer);

                if (scale < 100) {
                    const metadata = await sharpInstance.metadata();
                    if (metadata.width) {
                        const newWidth = Math.round(metadata.width * (scale / 100));
                        sharpInstance = sharpInstance.resize({ width: newWidth });
                    }
                }

                let finalBuffer;
                let mimeType = 'image/png';

                if (format === 'jpg' || format === 'jpeg') {
                    mimeType = 'image/jpeg';
                    finalBuffer = await sharpInstance
                        .flatten({ background: { r: 255, g: 255, b: 255 } })
                        .jpeg({ quality: quality })
                        .toBuffer();
                } else if (format === 'webp') {
                    mimeType = 'image/webp';
                    finalBuffer = await sharpInstance
                        .webp({ quality: quality })
                        .toBuffer();
                } else {
                    mimeType = 'image/png';
                    const compressionLevel = Math.floor((100 - quality) / 10);
                    finalBuffer = await sharpInstance
                        .png({ compressionLevel: Math.min(Math.max(compressionLevel, 0), 9) })
                        .toBuffer();
                }

                const rawName = path.parse(safeFileName).name || `image_${index + 1}`;
                const ext = format === 'jpg' ? 'jpg' : format;
                const outputName = `${rawName}_processed.${ext}`;

                processedResults.push({
                    index: index,
                    originalName: safeFileName,
                    outputName: outputName,
                    buffer: finalBuffer,
                    mimeType: mimeType,
                    base64: `data:${mimeType};base64,${finalBuffer.toString('base64')}`
                });

            } catch (singleErr) {
                console.error(`[错误] 处理文件 ${safeFileName} 失败:`, singleErr);
            }
        }

        console.log(`[日志] 全部图像处理完成！成功完成 ${processedResults.length} 张`);
        sendProgress(clientId, totalFiles, totalFiles, `处理完成！成功 ${processedResults.length} 张`);

        if (processedResults.length === 0) {
            return res.status(500).json({ error: '所有图片处理均失败，请检查文件格式' });
        }

        if (processedResults.length > 1) {
            const zip = new JSZip();
            processedResults.forEach(item => {
                zip.file(item.outputName, item.buffer);
            });

            const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

            res.setHeader('Content-Type', 'application/zip');
            const encodedZipName = encodeURIComponent(`${processedResults.length}个图片.zip`);
            res.setHeader('Content-Disposition', `attachment; filename="${encodedZipName}"; filename*=UTF-8''${encodedZipName}`);
            return res.send(zipBuffer);
        } else {
            // 单张:直接返回二进制流，避免 base64 编码导致的体积膨胀(~33%)
            // 与 data URL 过长时浏览器丢失 download 文件名的问题
            const single = processedResults[0];
            const encodedName = encodeURIComponent(single.outputName);
            res.setHeader('Content-Type', single.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
            return res.send(single.buffer);
        }

    } catch (error) {
        console.error('[报错] 接口整体处理异常:', error);
        res.status(500).json({ error: '后端处理过程出错，请重试' });
    }
});

module.exports = router;
