const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose'); // 引入 Mongoose

const app = express();
const server = http.createServer(app);

// 覆寫 MongoDB 連線區塊
const MONGO_URI = process.env.MONGO_URI; 
// ...

if (!MONGO_URI) {
    // ...
} else {
    mongoose.connect(MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => {
        console.log("MongoDB 連線成功！"); 
        loadQuestions(); // <--- 連線成功後，立即載入題目
    })
    .catch(err => console.error("MongoDB 連線失敗：", err));
}

// 2. 跨域設定 (CORS) - 允許 Vercel 前端連線
const io = new Server(server, {
    cors: {
        origin: "*", // 允許所有來源連線，確保 Vercel 能連上 Render
        methods: ["GET", "POST"]
    }
});

// 3. 遊戲數據模型 (Schema) - 正式題庫結構
const QuestionSchema = new mongoose.Schema({
    questionText: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswer: { type: String, required: true },
    points: { type: Number, default: 50 },
    category: { type: String, default: 'General' }
}, { collection: 'questions' }); 

const Question = mongoose.model('Question', QuestionSchema); 

// 4. 數據庫讀取邏輯 (新增以下程式碼)
async function loadQuestions() {
    if (mongoose.connection.readyState === 1) { // 檢查是否已連線
        try {
            const questions = await Question.find({}); // 從 'questions' 集合讀取所有數據
            loadedQuestions = questions;
            console.log(`成功從數據庫載入 ${loadedQuestions.length} 道醫學題目！`); // <--- 檢查這行！
        } catch (error) {
            console.error("讀取題庫數據失敗:", error);
        }
    }
}

// 4. 遊戲邏輯與 Socket.IO (與之前版本相同)
const PORT = process.env.PORT || 3001; 
let gameState = { players: {}, turnOrder: [] };
let playerCounter = 0;
let loadedQuestions = []; // 新增：用於儲存從數據庫讀取的題目

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
    const currentPlayer = gameState.players[socket.id];
    currentPlayer.position = (currentPlayer.position + diceResult) % 20;

    // 廣播骰子結果
    io.emit('diceRolled', { playerID: socket.id, result: diceResult });

    // === 新增：判斷是否停在問答格 ===
    // 模擬在位置 5, 10, 15 停下時需要答題
    const isQuestionSpace = currentPlayer.position === 5 || currentPlayer.position === 10 || currentPlayer.position === 15;
    
    if (isQuestionSpace && loadedQuestions.length > 0) {
        // 隨機選擇一道題目
        const questionIndex = Math.floor(Math.random() * loadedQuestions.length);
        const question = loadedQuestions[questionIndex];

        // 伺服器只發送題目資訊，不包含答案
        const questionData = {
            questionText: question.questionText,
            options: question.options,
            points: question.points,
            questionID: question._id 
        };

        // 傳送題目給該玩家 (使用 socket.emit 確保只有該玩家看到)
        socket.emit('startQuestion', questionData);
        console.log(`向 ${currentPlayer.name} (位置 ${currentPlayer.position}) 發送題目: ${question.questionText}`);

    } else if (currentPlayer.position === 0) {
        // 經過起點，發放工資
        currentPlayer.money += 200;
    } else {
        // 模擬一般格子的收入
        currentPlayer.money += diceResult * 10; 
    }

    io.emit('gameStateUpdate', gameState);
});

// [D] 玩家回答問題 (新增事件)
socket.on('submitAnswer', async ({ questionID, submittedAnswer }) => {
    const currentPlayer = gameState.players[socket.id];
    if (!currentPlayer) return;

    try {
        // 根據 ID 從數據庫中查找正確答案
        const Question = mongoose.model('Question'); // 再次取得 Question Model
        const question = await Question.findById(questionID);
        
        if (question && question.correctAnswer === submittedAnswer) {
            // 答對邏輯
            currentPlayer.money += question.points;
            socket.emit('answerResult', { success: true, message: `恭喜您，答對了！獲得 $${question.points}！`, newMoney: currentPlayer.money });
        } else {
            // 答錯邏輯
            const penalty = 50;
            currentPlayer.money -= penalty;
            socket.emit('answerResult', { success: false, message: `很遺憾，答錯了。扣除 $${penalty}。`, newMoney: currentPlayer.money });
        }
        
        // 更新所有玩家狀態
        io.emit('gameStateUpdate', gameState); 

    } catch (error) {
        console.error("處理答案時發生錯誤:", error);
    }
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