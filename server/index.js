const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

// --- 伺服器初始化 ---
const app = express();
const server = http.createServer(app);
// 允許跨域連線，這是讓前端 Vercel 連線到後端 Render 的關鍵
const io = new Server(server, {
    cors: {
        origin: "*", // 允許所有來源 (用於測試和免費部署)
        methods: ["GET", "POST"]
    }
}); 

const PORT = process.env.PORT || 3001; // 設定伺服器運行端口

// --- 遊戲狀態與邏輯 (多人同步的核心) ---
// 這裡我們暫時只放一個空的遊戲狀態，後面再填入複雜邏輯
let gameState = {
    players: {}, // 儲存玩家資訊
    status: "waiting",
    board: []
};

// 處理靜態檔案（如果需要）
app.get('/', (req, res) => {
  res.send('Medical Monopoly Server is running!');
});

// --- Socket.IO 連線處理 ---
io.on('connection', (socket) => {
    console.log(`[連線] 一位玩家加入: ${socket.id}`);

    // 玩家加入遊戲或創建房間的事件
    socket.on('joinGame', (playerName) => {
        // 簡化：將玩家加入單一的通用房間
        const playerID = socket.id;

        // 初始化玩家資料
        gameState.players[playerID] = {
            name: playerName,
            position: 0,
            money: 1500,
            id: playerID
        };

        // 通知所有已連線的客戶端，遊戲狀態更新了
        io.emit('gameStateUpdate', gameState);
        console.log(`玩家 ${playerName} 加入遊戲。目前人數: ${Object.keys(gameState.players).length}`);
    });

    // 玩家丟骰子的事件 (之後我們會在這裡加入真正的移動邏輯)
    socket.on('rollDice', () => {
         // 假設是當前回合的玩家
         const playerID = socket.id;
         if (gameState.players[playerID]) {
            const diceResult = Math.floor(Math.random() * 6) + 1;

            // 模擬移動和更新狀態
            gameState.players[playerID].position = (gameState.players[playerID].position + diceResult) % 40; // 假設有40格
            gameState.players[playerID].money += 10; // 模擬經過起點

            // 廣播更新
            io.emit('diceRolled', { playerID: playerID, result: diceResult });
            io.emit('gameStateUpdate', gameState);
            console.log(`玩家 ${gameState.players[playerID].name} 丟出 ${diceResult}`);
         }
    });

    // 玩家斷線事件
    socket.on('disconnect', () => {
        console.log(`[斷線] 玩家離開: ${socket.id}`);
        delete gameState.players[socket.id];
        // 再次廣播更新狀態
        io.emit('gameStateUpdate', gameState);
    });
});

// 啟動伺服器
server.listen(PORT, () => {
    console.log(`🎉 後端伺服器運行在 http://localhost:${PORT}`);
});