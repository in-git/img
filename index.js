const express = require('express');

const app = express();
const PORT = 3100;

// 静态托管前端页面
app.use(express.static('public'));

// 路由挂载
app.use('/api', require('./routes/imageProcess'));

app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`服务启动成功: http://localhost:${PORT}`);
    console.log(`=================================`);
});
