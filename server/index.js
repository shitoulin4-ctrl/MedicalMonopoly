const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose'); // 引入 Mongoose

const app = express();
const server = http.createServer(app);

// 1. MongoDB 連線設定
const MONGO_URI = process.env.MONGO_URI; 

if (!MONGO_URI) {
    console.error("錯誤：MONGO_URI 環境變數未設定！無法連線到數據庫。");
} else {
    mongoose.connect(MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => console.log("MongoDB 連線成功！可以開始儲存題庫與進度。"))
    .catch(err => console.error("MongoDB 連線失敗：", err));
}

// 2. 跨域設定 (CORS) - 允許 Vercel 前端連線
const io = new Server(server, {
    cors: {
        origin: "*", // 允許所有來源連線，確保 Vercel 能連上 Render
        methods: ["GET", "POST"]
    }
});

// 3. 遊戲數據模型 (Schema) - 範例：題庫結構
// 雖然我們還沒使用它，但我們確保數據庫連線時能運行
const QuestionSchema = new mongoose.Schema({
    questionText: String,
    answer: String,
    category: String,
    points: Number
});

// 4. 遊戲邏輯與 Socket.IO (與之前版本相同)
const PORT = process.env.PORT || 3001; 
let gameState = { players: {}, turnOrder: [] };
let playerCounter = 0;

io.on('connection', (socket) => {
    console.log(`用戶連線: ${socket.id}`);

    // [A] 玩家加入遊戲
    socket.on('joinGame', (playerName) => {
        if (gameState.players[socket.id]) return; 

        gameState.players[socket.id] = {
            id: socket.id,
            name: playerName,
            money: 1500,
            position: 0,
            isTurn: false 
        };
        gameState.turnOrder.push(socket.id); 

        console.log(`玩家加入: ${playerName}, 當前人數: ${gameState.turnOrder.length}`);
        io.emit('gameStateUpdate', gameState); 
    });

    // [B] 玩家丟骰子
    socket.on('rollDice', () => {
        if (!gameState.players[socket.id]) return; 
        
        const diceResult = Math.floor(Math.random() * 6) + 1;
        
        // 模擬移動邏輯
        gameState.players[socket.id].position = (gameState.players[socket.id].position + diceResult) % 20;
        gameState.players[socket.id].money += diceResult * 10; // 模擬收入

        // 廣播給所有玩家
        io.emit('diceRolled', { playerID: socket.id, result: diceResult });
        io.emit('gameStateUpdate', gameState);
    });

    // [C] 玩家斷線
    socket.on('disconnect', () => {
        if (gameState.players[socket.id]) {
            console.log(`玩家斷線: ${gameState.players[socket.id].name}`);
            delete gameState.players[socket.id];
            gameState.turnOrder = gameState.turnOrder.filter(id => id !== socket.id);
            io.emit('gameStateUpdate', gameState);
        }
    });
});


// 5. 伺服器啟動
server.listen(PORT, () => {
    console.log(`Socket.IO 伺服器運行在端口: ${PORT}`);
});

// 根路由測試
app.get('/', (req, res) => {
    res.send('Medical Monopoly Server is running and connecting to MongoDB!');
});