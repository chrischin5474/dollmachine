/* 可愛黏土風娃娃機拼字遊戲 - 遊戲邏輯 JS */

// --- 遊戲常數與設定 ---
const DEFAULT_VOCABULARY = [
  { word: "fast", translation: "快" },
  { word: "the USA", translation: "美國" }, // 🚀 加入帶有空格的預設單字，以測試空格邏輯
  { word: "pull", translation: "拉" },
  { word: "clay", translation: "黏土" },
  { word: "bear", translation: "小熊" },
  { word: "cute", translation: "可愛" },
  { word: "jump", translation: "跳" },
  { word: "play", translation: "玩" },
  { word: "happy", translation: "快樂" },
  { word: "sweet", translation: "甜的" }
];

// 預設遊戲進度長度 (10 題一輪)
const ROUND_LENGTH = 10;

// --- 遊戲狀態變數 ---
let vocabulary = [...DEFAULT_VOCABULARY];
let currentQuestionIndex = 0; // 0-based index for current round
let vocabularyIndex = 0;      // index in the loaded vocabulary list
let completedCount = 0;       // total completed count
let currentWordObj = null;
let spelledLetters = [];      // e.g. ['f', '', '', '']
let questionHistory = [];     // Array of 'correct' or 'incorrect' for top dots

// 爪子狀態
let clawX = 50; // 百分比 (0% - 100%)
let clawY = 40; // 鋼絲高度 (px)
const CLAW_MIN_X = 5;  // %
const CLAW_MAX_X = 95; // %
const CLAW_START_Y = 40; // px
const CLAW_MAX_Y = 245;  // 鋼絲拉伸最大高度 (px)

let clawState = "idle"; // idle, dropping, retracting, grabbing, shaking
let clawSpeedX = 0;     // 爪子水平移動速度
const CLAW_MOVE_SPEED_X = 0.8; // 水平移動靈敏度 (%)
const DROP_SPEED = 4.5; // 下放速度 (px/frame)
const RETRACT_SPEED = 3.5; // 收回速度 (px/frame)

// 滾動字母
let letterBalls = [];
let ballIdCounter = 0;
let lastSpawnTime = 0;
const SPAWN_INTERVAL = 1600; // 每 1.6 秒生成一個字母 (ms)
const BALL_SPEED = 2.0; // 字母滾動速度 (px/frame)

// 碰撞與抓取關聯
let grabbedBall = null;
let grabbedBallIndex = -1; // 🚀 記錄當前夾到的字母要放入哪個拼字格索引 (支援任意順序抓取)
let keyboardState = {};

// DOM 元素引用
const currentQuestionEl = document.getElementById("current-question");
const completedCountEl = document.getElementById("completed-count");
const progressDotsContainer = document.getElementById("progress-dots");
const clawStringEl = document.getElementById("claw-string");
const clawBodyEl = document.getElementById("claw-body");
const beltTrackEl = document.getElementById("belt-track");
const letterSlotsContainer = document.getElementById("letter-slots");
const hintTextEl = document.getElementById("hint-text");
const celebrationOverlay = document.getElementById("celebration-overlay");
const celebrationWordEl = document.getElementById("celebration-word");
const celebrationTextEl = document.getElementById("celebration-text");

// 🚀 Start Screen / 歡迎首頁元素
const welcomeOverlay = document.getElementById("welcome-overlay");
const startGameBtn = document.getElementById("start-game-btn");
const exitGameBtn = document.getElementById("exit-game-btn");
const exitInGameBtn = document.getElementById("exit-in-game-btn");
const welcomeSubtitle = document.getElementById("welcome-subtitle");

// 控制按鈕
const leftBtn = document.getElementById("left-btn");
const rightBtn = document.getElementById("right-btn");
const grabBtn = document.getElementById("grab-btn");
const soundBtn = document.getElementById("sound-btn");
const settingsBtn = document.getElementById("settings-btn");
const nextBtn = document.getElementById("next-btn");

// 設定彈窗元素
const settingsModal = document.getElementById("settings-modal");
const sheetUrlInput = document.getElementById("sheet-url");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const clearSettingsBtn = document.getElementById("clear-settings-btn");
const closeModalBtn = document.getElementById("close-modal-btn");

// --- 初始化遊戲 ---
window.addEventListener("DOMContentLoaded", () => {
  initTTS();
  loadSettingsAndVocab();
  initProgressDots();
  setupEventListeners();
  
  // 開始遊戲循環
  requestAnimationFrame(gameLoop);
});

// --- 語音發音 (TTS) 相關功能 ---
let ttsVoices = [];
function initTTS() {
  if ("speechSynthesis" in window) {
    // Chrome 等瀏覽器聲音非同步載入，需監聽 voiceschanged
    window.speechSynthesis.onvoiceschanged = () => {
      ttsVoices = window.speechSynthesis.getVoices();
    };
    ttsVoices = window.speechSynthesis.getVoices();
  }
}

function speak(text, lang = "en-US") {
  if (!("speechSynthesis" in window)) return;
  
  // 取消當前所有播放，避免堆疊
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  
  // 尋找發音較優質的英文發音源 (如 Google 英文)
  if (lang === "en-US" && ttsVoices.length > 0) {
    const preferredVoice = ttsVoices.find(v => v.lang.startsWith("en") && v.name.includes("Google")) ||
                           ttsVoices.find(v => v.lang.startsWith("en"));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
  }
  
  utterance.rate = 0.85; // 稍微放慢一點，方便小朋友學習
  window.speechSynthesis.speak(utterance);
}

// --- Google Sheets 資料載入與解析 ---
function loadSettingsAndVocab() {
  const savedUrl = localStorage.getItem("doll_machine_sheet_url");
  if (savedUrl) {
    sheetUrlInput.value = savedUrl;
    fetchVocabulary(savedUrl);
  } else {
    // 沒有自訂網址，使用預設單字
    vocabulary = [...DEFAULT_VOCABULARY];
    completedCount = parseInt(localStorage.getItem("doll_machine_completed") || "0");
    completedCountEl.textContent = completedCount;
  }
}

async function fetchVocabulary(url) {
  try {
    const csvUrl = convertToCSVUrl(url);
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error("網路請求失敗");
    
    const text = await response.text();
    const rows = parseCSV(text);
    
    // 解析符合條件的單字行 (過濾標題)
    let startIndex = 0;
    if (rows.length > 0 && rows[0][0]) {
      const firstCol = rows[0][0].toLowerCase();
      if (firstCol.includes("word") || firstCol.includes("單字")) {
        startIndex = 1;
      }
    }
    
    const parsedVocab = [];
    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      if (row.length >= 2 && row[0] && row[1]) {
        parsedVocab.push({
          // 🚀 修改過濾正則：[^a-zA-Z ] 允許英文字母與空格 (保留空格)
          word: row[0].trim().replace(/[^a-zA-Z ]/g, ''), 
          translation: row[1].trim()
        });
      }
    }
    
    if (parsedVocab.length > 0) {
      vocabulary = parsedVocab;
      console.log("成功從 Google Sheets 載入單字庫：", vocabulary);
      alert("單字庫載入成功！共有 " + vocabulary.length + " 個單字。");
      
      // 重置關卡進度
      vocabularyIndex = 0;
      currentQuestionIndex = 0;
      completedCount = 0;
      localStorage.setItem("doll_machine_completed", "0");
      completedCountEl.textContent = completedCount;
      
      // 如果不在歡迎畫面，就重新加載
      if (!welcomeOverlay.classList.contains("open")) {
        startNewGameRound();
      }
      initProgressDots();
    } else {
      alert("未能在 Google Sheet 中找到有效單字。請確認欄位格式是否正確！");
    }
  } catch (error) {
    console.error("載入失敗：", error);
    alert("單字庫載入失敗，請確認連結是否已發布到網路且為公開 CSV 格式！將載入預設單字。");
    vocabulary = [...DEFAULT_VOCABULARY];
    if (!welcomeOverlay.classList.contains("open")) {
      startNewGameRound();
    }
  }
}

// 轉換 Google Sheet 網址為 CSV 匯出網址
function convertToCSVUrl(url) {
  if (!url) return "";
  if (url.includes("output=csv")) return url;
  
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return `https://docs.google.com/spreadsheets/d/${match[1]}/pub?output=csv`;
  }
  return url;
}

// 簡易 CSV 解析器 (處理逗號與引號)
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    const cols = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    cols.push(current);
    return cols.map(c => c.replace(/^"|"$/g, '').trim());
  }).filter(row => row.length > 0 && row[0]);
}

// --- 進度條點點初始化 ---
function initProgressDots() {
  progressDotsContainer.innerHTML = "";
  questionHistory = [];
  for (let i = 0; i < ROUND_LENGTH; i++) {
    const dot = document.createElement("div");
    dot.className = "dot";
    progressDotsContainer.appendChild(dot);
  }
  updateProgressDots();
}

function updateProgressDots() {
  const dots = progressDotsContainer.querySelectorAll(".dot");
  dots.forEach((dot, idx) => {
    dot.className = "dot"; // 清除所有狀態
    if (idx === currentQuestionIndex) {
      dot.classList.add("active");
    } else if (questionHistory[idx] === "correct") {
      dot.classList.add("correct");
    } else if (questionHistory[idx] === "incorrect") {
      dot.classList.add("incorrect");
    }
  });
}

// --- 開始新的一題 ---
function startNewGameRound() {
  if (vocabulary.length === 0) return;
  
  // 取得當前題目
  currentWordObj = vocabulary[vocabularyIndex % vocabulary.length];
  
  // 初始化拼字格
  spelledLetters = Array(currentWordObj.word.length).fill("");
  
  // 🚀 空格特殊處理：如果單字字元是空格，直接在 spelledLetters 填入空格，這樣就不需要玩家去夾空格球
  for (let i = 0; i < currentWordObj.word.length; i++) {
    if (currentWordObj.word[i] === " ") {
      spelledLetters[i] = " ";
    }
  }
  
  // 更新介面
  currentQuestionEl.textContent = currentQuestionIndex + 1;
  hintTextEl.textContent = currentWordObj.translation;
  
  renderLetterSlots();
  
  // 自動發音
  setTimeout(() => {
    // 只有在首頁是關閉的情況下才自動發音
    if (!welcomeOverlay.classList.contains("open")) {
      speak(currentWordObj.word);
    }
  }, 600);
}

function renderLetterSlots() {
  letterSlotsContainer.innerHTML = "";
  // 🚀 空格特殊處理：遍歷原單字，若是空格則生成間隔元素 (slot-spacer)
  for (let i = 0; i < currentWordObj.word.length; i++) {
    const char = currentWordObj.word[i];
    const letter = spelledLetters[i];
    
    const slot = document.createElement("div");
    if (char === " ") {
      slot.className = "slot-spacer";
    } else {
      slot.className = "slot" + (letter ? " filled" : "");
      slot.textContent = letter;
    }
    letterSlotsContainer.appendChild(slot);
  }
}

// --- 字母生成與滾動邏輯 ---
function spawnLetterBall() {
  if (!currentWordObj) return;
  
  // 找出當前還沒被夾到、或者是拼字需要的字母
  const neededLetters = [];
  for (let i = 0; i < currentWordObj.word.length; i++) {
    if (spelledLetters[i] === "") {
      neededLetters.push(currentWordObj.word[i]);
    }
  }
  
  const nextTargetLetter = neededLetters[0]; // 依照順序需要夾的字母 (包含正確大小寫)
  
  let spawnChar = "";
  const randVal = Math.random();
  
  if (nextTargetLetter && randVal < 0.35) {
    // 35% 機率生成下一個正需要的字母
    spawnChar = nextTargetLetter;
  } else if (neededLetters.length > 0 && randVal < 0.6) {
    // 25% 機率生成單字中其他還需要的字母
    spawnChar = neededLetters[Math.floor(Math.random() * neededLetters.length)];
  } else {
    // 40% 機率生成隨機字母 (干擾項)
    // 配合當前需要抓取字母的大小寫決定干擾字母大小寫
    const isUppercase = nextTargetLetter && nextTargetLetter === nextTargetLetter.toUpperCase();
    const alphabet = isUppercase ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ" : "abcdefghijklmnopqrstuvwxyz";
    spawnChar = alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  
  // 建立字母球 DOM
  const ball = document.createElement("div");
  const colorClass = "color-" + Math.floor(Math.random() * 5);
  ball.className = `clay-ball ${colorClass}`;
  ball.textContent = spawnChar;
  
  // 初始位置設定在右側外 (100% 寬度之外)
  const windowWidth = beltTrackEl.clientWidth || 600;
  const initialX = windowWidth + 10;
  ball.style.left = `${initialX}px`;
  
  // 儲存狀態物件
  const ballObj = {
    id: ballIdCounter++,
    char: spawnChar,
    x: initialX,
    colorClass: colorClass,
    element: ball,
    grabbed: false
  };
  
  // 🚀 平板觸控優化：直接點擊字母球，爪子會自動滑過去抓取！
  ball.addEventListener("click", () => {
    if (clawState !== "idle" || ballObj.grabbed) return;
    
    // 計算該球相對於傳送帶中心點的 X 位置百分比
    const width = beltTrackEl.clientWidth || 600;
    const ballCenterX = ballObj.x + 35;
    let targetX = (ballCenterX / width) * 100;
    
    // 限制爪子邊界
    targetX = Math.max(CLAW_MIN_X, Math.min(CLAW_MAX_X, targetX));
    
    // 移動爪子並觸發抓取
    clawX = targetX;
    triggerGrab();
  });
  
  // 加入傳送帶 DOM
  beltTrackEl.appendChild(ball);
  letterBalls.push(ballObj);
}

function updateLetterBalls() {
  const windowWidth = beltTrackEl.clientWidth || 600;
  
  letterBalls.forEach(ball => {
    if (ball.grabbed) {
      // 爪子抓到字母時，字母跟隨爪子中心點
      const rect = beltTrackEl.getBoundingClientRect();
      const clawRect = clawBodyEl.getBoundingClientRect();
      
      // 計算爪子在傳送帶軌道內的相對 X 與 Y
      const relativeX = clawRect.left + (clawRect.width / 2) - rect.left;
      const relativeY = clawRect.top + clawRect.height - rect.top - 30; // 稍微貼合爪子下方
      
      ball.x = relativeX - 35; // 35 是球半徑
      ball.element.style.left = `${ball.x}px`;
      ball.element.style.top = `${relativeY}px`;
      ball.element.classList.add("grabbed");
    } else {
      // 正常由右至左移動
      ball.x -= BALL_SPEED;
      ball.element.style.left = `${ball.x}px`;
      ball.element.style.top = `15px`; // 固定高度
    }
  });
  
  // 移除超出左側螢幕的字母
  const outOfScreen = ball => ball.x < -80 && !ball.grabbed;
  letterBalls.filter(outOfScreen).forEach(ball => {
    ball.element.remove();
  });
  letterBalls = letterBalls.filter(ball => !outOfScreen(ball));
}

// --- 爪子移動與抓取碰撞邏輯 ---
function updateClaw() {
  const windowEl = document.querySelector(".machine-window");
  const windowWidth = windowEl.clientWidth;
  
  // 1. 水平移動控制 (只在 idle 狀態下可由按鈕或鍵盤左右操作)
  if (clawState === "idle") {
    // 檢查鍵盤狀態或按鈕速度
    if (keyboardState["ArrowLeft"]) {
      clawSpeedX = -CLAW_MOVE_SPEED_X;
    } else if (keyboardState["ArrowRight"]) {
      clawSpeedX = CLAW_MOVE_SPEED_X;
    }
    
    clawX += clawSpeedX;
    clawX = Math.max(CLAW_MIN_X, Math.min(CLAW_MAX_X, clawX));
  }
  
  // 更新爪子水平位置
  clawBodyEl.style.left = `${clawX}%`;
  clawStringEl.style.left = `${clawX}%`;
  
  // 2. 垂直下放與抓取狀態機
  if (clawState === "dropping") {
    clawY += DROP_SPEED;
    clawStringEl.style.height = `${clawY}px`;
    clawBodyEl.style.top = `${clawY + 15}px`; // 15px 滑軌偏移
    
    // 當爪子下放到達傳送帶判定點時
    if (clawY >= CLAW_MAX_Y) {
      checkCatchCollision();
    }
  } 
  else if (clawState === "grabbing") {
    // 抓到正確字母的收回狀態
    clawY -= RETRACT_SPEED;
    clawStringEl.style.height = `${clawY}px`;
    clawBodyEl.style.top = `${clawY + 15}px`;
    
    if (clawY <= CLAW_START_Y) {
      clawY = CLAW_START_Y;
      clawStringEl.style.height = `${clawY}px`;
      clawBodyEl.style.top = `${clawY + 15}px`;
      
      // 完全收回！將字母放入格子中
      handleSuccessfulGrab();
    }
  } 
  else if (clawState === "shaking") {
    // 抓到錯誤字母時的晃動甩落動畫
    clawY -= RETRACT_SPEED;
    clawStringEl.style.height = `${clawY}px`;
    clawBodyEl.style.top = `${clawY + 15}px`;
    
    // 在收回的半路上 (約 130px 處) 發動甩落
    if (clawY <= 130 && grabbedBall) {
      releaseWrongLetter();
    }
    
    if (clawY <= CLAW_START_Y) {
      clawY = CLAW_START_Y;
      clawStringEl.style.height = `${clawY}px`;
      clawBodyEl.style.top = `${clawY + 15}px`;
      clawState = "idle";
    }
  }
  else if (clawState === "retracting") {
    // 空爪收回
    clawY -= RETRACT_SPEED;
    clawStringEl.style.height = `${clawY}px`;
    clawBodyEl.style.top = `${clawY + 15}px`;
    
    if (clawY <= CLAW_START_Y) {
      clawY = CLAW_START_Y;
      clawStringEl.style.height = `${clawY}px`;
      clawBodyEl.style.top = `${clawY + 15}px`;
      clawState = "idle";
    }
  }
}

// 偵測爪子與傳送帶字母的碰撞
function checkCatchCollision() {
  const windowEl = document.querySelector(".machine-window");
  const windowWidth = windowEl.clientWidth;
  
  // 計算爪子中心相對於視窗的 X 位置 (px)
  const clawPxX = (clawX / 100) * windowWidth;
  
  let collidedBall = null;
  const collisionTolerance = 45; // 碰撞容許半徑像素差 (球寬 70px)
  
  // 在所有球中尋找碰撞者
  for (let i = 0; i < letterBalls.length; i++) {
    const ball = letterBalls[i];
    const ballCenterX = ball.x + 35; // 球心 X
    const distance = Math.abs(clawPxX - ballCenterX);
    
    if (distance < collisionTolerance) {
      collidedBall = ball;
      break; // 抓到第一個即可
    }
  }
  
  if (collidedBall) {
    grabbedBall = collidedBall;
    grabbedBall.grabbed = true;
    
    // 🚀 【改良任意順序抓取邏輯】：
    // 尋找單字中與被夾字母相符、且尚未被填入的字母索引位置
    let targetIndex = -1;
    for (let i = 0; i < currentWordObj.word.length; i++) {
      if (currentWordObj.word[i] === collidedBall.char && spelledLetters[i] === "") {
        targetIndex = i;
        break; // 找到第一個相符的空格就填入
      }
    }
    
    // 🚀 如果找到有效位置，就代表抓取正確！
    if (targetIndex !== -1) {
      clawState = "grabbing";
      grabbedBallIndex = targetIndex; // 暫存要填入的索引
      speak(collidedBall.char); // 唸出被抓到的字母
    } else {
      // 抓錯了（單字中沒有該字母，或該字母在此題已經全部被夾完了）
      clawState = "shaking";
      speak("Oops");
    }
  } else {
    // 空爪收回
    clawState = "retracting";
  }
}

// 甩落錯誤字母
function releaseWrongLetter() {
  if (!grabbedBall) return;
  
  const ball = grabbedBall;
  grabbedBall = null;
  ball.grabbed = false;
  ball.element.classList.remove("grabbed");
  
  // 增加物理墜落動畫
  let dropY = 130;
  const gravity = 0.5;
  let dropVel = 0;
  
  const fallLoop = () => {
    dropVel += gravity;
    dropY += dropVel;
    ball.element.style.top = `${dropY}px`;
    
    // 超過傳送帶下方就消失
    if (dropY < 390) {
      requestAnimationFrame(fallLoop);
    } else {
      ball.element.style.transform = "scale(0)";
      setTimeout(() => {
        ball.element.remove();
      }, 200);
      
      // 移出字母陣列
      letterBalls = letterBalls.filter(b => b.id !== ball.id);
    }
  };
  requestAnimationFrame(fallLoop);
  
  // 給娃娃機一個震動效果
  const frame = document.querySelector(".doll-machine-frame");
  frame.classList.add("shake-animation");
  setTimeout(() => {
    frame.classList.remove("shake-animation");
  }, 400);
}

// 成功抓取正確字母，放入拼字格
function handleSuccessfulGrab() {
  if (!grabbedBall || grabbedBallIndex === -1) return;
  
  const ball = grabbedBall;
  grabbedBall = null;
  
  // 🚀 放入對應的拼字格索引中 (支援任意順序)
  spelledLetters[grabbedBallIndex] = ball.char;
  grabbedBallIndex = -1; // 重置
  
  renderLetterSlots();
  
  // 字母球飛向空格的動畫
  ball.element.remove();
  letterBalls = letterBalls.filter(b => b.id !== ball.id);
  
  // 檢查單字是否全部拼完
  checkWordComplete();
  
  clawState = "idle";
}

// 檢查單字是否完成
function checkWordComplete() {
  if (spelledLetters.includes("")) {
    // 還沒拼完，繼續
    return;
  }
  
  // 拼完了！
  completedCount++;
  localStorage.setItem("doll_machine_completed", completedCount);
  completedCountEl.textContent = completedCount;
  
  // 更新目前這題的歷史紀錄為 Correct
  questionHistory[currentQuestionIndex] = "correct";
  updateProgressDots();
  
  // 延遲播放過關音樂/發音
  setTimeout(() => {
    speak("Excellent! " + currentWordObj.word);
    
    // 開啟過關彈窗
    celebrationWordEl.textContent = currentWordObj.word;
    
    // 中文祝賀詞隨機選取
    const congrats = ["太棒了！", "真厲害！", "你做到了！", "太聰明了！"];
    celebrationTextEl.textContent = congrats[Math.floor(Math.random() * congrats.length)];
    
    celebrationOverlay.classList.add("open");
  }, 400);
}

// 進入下一題
function nextQuestion() {
  celebrationOverlay.classList.remove("open");
  
  // 清除當前所有的字母圓球，重新開始
  letterBalls.forEach(b => b.element.remove());
  letterBalls = [];
  
  currentQuestionIndex++;
  vocabularyIndex++;
  
  // 檢查一輪是否完成
  if (currentQuestionIndex >= ROUND_LENGTH) {
    currentQuestionIndex = 0;
    initProgressDots();
  } else {
    updateProgressDots();
  }
  
  startNewGameRound();
}

// --- 事件處理設定 ---
function setupEventListeners() {
  // 🚀 首頁「開始遊戲」與「結束遊戲」監聽
  startGameBtn.addEventListener("click", () => {
    welcomeOverlay.classList.remove("open");
    speak("Start!");
    
    // 初始化/重置單字關卡
    startNewGameRound();
  });
  
  exitGameBtn.addEventListener("click", () => {
    speak("Goodbye!");
    
    // 試圖關閉視窗 (部分瀏覽器因為安全性可能不允許關閉非腳本打開的視窗)
    window.close();
    
    // 如果關閉失敗，顯示溫馨提示文字
    setTimeout(() => {
      welcomeSubtitle.textContent = "感謝您的遊玩！請直接關閉此網頁分頁即可！👋";
      welcomeSubtitle.style.color = "#ff5e7e";
      welcomeSubtitle.style.fontWeight = "bold";
      // 隱藏按鈕，避免重疊
      startGameBtn.style.display = "none";
      exitGameBtn.style.display = "none";
    }, 200);
  });
  
  // 🚪 遊戲中「離開」按鈕
  exitInGameBtn.addEventListener("click", () => {
    speak("Exit!");
    
    // 重置歡迎頁提示文字
    welcomeSubtitle.textContent = "操作爪子抓取滾動字母，拼出正確的英文單字！";
    welcomeSubtitle.style.color = "#7d7d7d";
    welcomeSubtitle.style.fontWeight = "normal";
    startGameBtn.style.display = "inline-block";
    exitGameBtn.style.display = "inline-block";
    
    // 開啟首頁遮罩
    welcomeOverlay.classList.add("open");
    
    // 清空軌道上的字母與拼寫格子
    letterBalls.forEach(b => b.element.remove());
    letterBalls = [];
    spelledLetters = [];
    renderLetterSlots();
  });

  // 搖桿水平控制 (點按滑鼠)
  leftBtn.addEventListener("mousedown", () => { clawSpeedX = -CLAW_MOVE_SPEED_X; });
  leftBtn.addEventListener("mouseup", () => { clawSpeedX = 0; });
  leftBtn.addEventListener("mouseleave", () => { clawSpeedX = 0; });
  
  rightBtn.addEventListener("mousedown", () => { clawSpeedX = CLAW_MOVE_SPEED_X; });
  rightBtn.addEventListener("mouseup", () => { clawSpeedX = 0; });
  rightBtn.addEventListener("mouseleave", () => { clawSpeedX = 0; });
  
  // 支援手機觸控
  leftBtn.addEventListener("touchstart", (e) => { e.preventDefault(); clawSpeedX = -CLAW_MOVE_SPEED_X; });
  leftBtn.addEventListener("touchend", () => { clawSpeedX = 0; });
  rightBtn.addEventListener("touchstart", (e) => { e.preventDefault(); clawSpeedX = CLAW_MOVE_SPEED_X; });
  rightBtn.addEventListener("touchend", () => { clawSpeedX = 0; });
  
  // 抓取按鈕
  grabBtn.addEventListener("click", triggerGrab);
  
  // 發音按鈕
  soundBtn.addEventListener("click", () => {
    if (currentWordObj) {
      speak(currentWordObj.word);
    }
  });
  
  // 設定按鈕開啟與關閉
  settingsBtn.addEventListener("click", () => {
    settingsModal.classList.add("open");
  });
  
  closeModalBtn.addEventListener("click", () => {
    settingsModal.classList.remove("open");
  });
  
  // 點背景關閉彈窗
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove("open");
    }
  });
  
  // 儲存設定
  saveSettingsBtn.addEventListener("click", () => {
    const url = sheetUrlInput.value.trim();
    if (url) {
      localStorage.setItem("doll_machine_sheet_url", url);
      settingsModal.classList.remove("open");
      fetchVocabulary(url);
    } else {
      alert("請輸入有效的 Google Sheets 連結！");
    }
  });
  
  // 恢復預設設定
  clearSettingsBtn.addEventListener("click", () => {
    localStorage.removeItem("doll_machine_sheet_url");
    sheetUrlInput.value = "";
    settingsModal.classList.remove("open");
    vocabulary = [...DEFAULT_VOCABULARY];
    
    vocabularyIndex = 0;
    currentQuestionIndex = 0;
    completedCount = 0;
    localStorage.setItem("doll_machine_completed", "0");
    completedCountEl.textContent = completedCount;
    
    // 如果首頁沒打開，才重新載入題目
    if (!welcomeOverlay.classList.contains("open")) {
      startNewGameRound();
    }
    initProgressDots();
    alert("已恢復為預設單字庫！");
  });
  
  // 下一題按鈕
  nextBtn.addEventListener("click", nextQuestion);
  
  // 鍵盤控制支援
  window.addEventListener("keydown", (e) => {
    if (settingsModal.classList.contains("open") || welcomeOverlay.classList.contains("open")) return;
    
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      keyboardState[e.key] = true;
    }
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault(); // 防止網頁滾動
      triggerGrab();
    }
  });
  
  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      keyboardState[e.key] = false;
      // 當兩個鍵都放開時速度歸零
      if (!keyboardState["ArrowLeft"] && !keyboardState["ArrowRight"]) {
        clawSpeedX = 0;
      }
    }
  });
}

// 🚀 改良抓取發射動作：如果為空格，則發音 "Space" 
function triggerGrab() {
  if (clawState === "idle" && !welcomeOverlay.classList.contains("open")) {
    clawState = "dropping";
    speak("Down");
  }
}

// --- 遊戲主循環 (Frame Loop) ---
function gameLoop(timestamp) {
  // 如果首頁大遮罩是打開的，就暫停所有遊戲動作的更新
  if (welcomeOverlay && welcomeOverlay.classList.contains("open")) {
    requestAnimationFrame(gameLoop);
    return;
  }

  // 1. 生成滾動字母
  if (timestamp - lastSpawnTime > SPAWN_INTERVAL) {
    spawnLetterBall();
    lastSpawnTime = timestamp;
  }
  
  // 2. 更新字母位置與狀態
  updateLetterBalls();
  
  // 3. 更新爪子位置與動作
  updateClaw();
  
  // 4. 重複執行
  requestAnimationFrame(gameLoop);
}
