/**
 * HCI AI Interface - Simplified Real-time Chat
 * Clean WebSocket-based messaging with Ollama integration
 */

// ==================== DOM ELEMENTS ====================
const messagesContainer = document.getElementById("messagesContainer");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const connectBtn = document.getElementById("connectBtn");
const resetBtn = document.getElementById("resetBtn");
const testBtn = document.getElementById("testBtn");
const connectionStatus = document.getElementById("connectionStatus");
const connectionText = document.getElementById("connectionText");
const processingIndicator = document.getElementById("processingIndicator");
const processingTimer = document.getElementById("processingTimer");
const tokenCount = document.getElementById("tokenCount");
const deviceMenuBtn = document.getElementById("deviceMenuBtn");
const deviceMenu = document.getElementById("deviceMenu");
const cameraSelect = document.getElementById("cameraSelect");
const microphoneSelect = document.getElementById("microphoneSelect");
const visionToggle = document.getElementById("visionToggle");

// ==================== STATE ====================
let ws = null;
let stream = null;
let isConnected = false;
let visionEnabled = false;
let currentImageData = null;
let processingStartTime = null;
let processingTimerInterval = null;
let tokenCountValue = 0;

// ==================== INITIALIZATION ====================

deviceMenuBtn.addEventListener("click", () => {
  deviceMenu.style.display =
    deviceMenu.style.display === "none" ? "block" : "none";
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".device-selector")) {
    deviceMenu.style.display = "none";
  }
});

visionToggle?.addEventListener("change", (e) => {
  visionEnabled = e.target.checked;
  console.log([Vision] + (visionEnabled ? "ENABLED" : "DISABLED"));
});

window.addEventListener("load", async () => {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    await enumerateDevices();
    await initializeCamera();
  } catch (error) {
    console.error("Permission denied:", error);
    addSystemMessage("Camera/microphone access denied");
  }
});

async function enumerateDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === "videoinput");
    const audioDevices = devices.filter((d) => d.kind === "audioinput");

    cameraSelect.innerHTML = "";
    videoDevices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || Camera + (index + 1);
      cameraSelect.appendChild(option);
    });

    microphoneSelect.innerHTML = "";
    audioDevices.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || Microphone + (index + 1);
      microphoneSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error enumerating devices:", error);
  }
}

async function initializeCamera() {
  try {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    const constraints = {
      video: cameraSelect.value
        ? { deviceId: { exact: cameraSelect.value } }
        : { facingMode: "user" },
      audio: false,
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    document.getElementById("videoPreview").srcObject = stream;
  } catch (error) {
    console.error("Error accessing camera:", error);
    addSystemMessage("Error: Camera access denied");
  }
}

function captureImage() {
  const canvas = document.createElement("canvas");
  const video = document.getElementById("videoPreview");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg");
}

// ==================== WEBSOCKET ====================

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = protocol + "//" + window.location.host + "/ws";

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected");
    isConnected = true;
    updateConnectionStatus(true);
    textInput.disabled = false;
    sendBtn.disabled = false;
    resetBtn.disabled = false;
    connectBtn.textContent = "Disconnect";
    connectBtn.classList.add("connected");
    addSystemMessage("Connected to AI");
  };

  ws.onmessage = (event) => {
    console.log("[WebSocket] Raw event data:", event.data);
    try {
      let data;
      try {
        data = JSON.parse(event.data);
        console.log("[WebSocket] Parsed JSON:", data);
      } catch (e) {
        console.log("[WebSocket] Not JSON, treating as status");
        data = { type: "status", content: event.data };
      }

      const { type, content } = data;
      console.log(
        "[Handler] Processing type: " +
          type +
          ", content length: " +
          String(content).length,
      );

      switch (type) {
        case "response":
          console.log("[Handler] Response token received:", content);
          addAssistantToken(content);
          tokenCountValue++;
          tokenCount.textContent = tokenCountValue;
          console.log("[Handler] Token count now:", tokenCountValue);
          break;
        case "status":
          console.log("[Handler] Status message:", content);
          addSystemMessage(content);
          break;
        case "error":
          console.error("[Handler] Error message:", content);
          hideProcessingIndicator();
          addSystemMessage("Error: " + content);
          break;
        default:
          console.warn("[Handler] Unknown message type:", type);
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    addSystemMessage("Connection error");
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected");
    isConnected = false;
    updateConnectionStatus(false);
    textInput.disabled = true;
    sendBtn.disabled = true;
    resetBtn.disabled = true;
    connectBtn.textContent = "Connect";
    connectBtn.classList.remove("connected");
    addSystemMessage("Disconnected from AI");
  };
}

function disconnectWebSocket() {
  if (ws) {
    ws.close();
    ws = null;
  }
}

function updateConnectionStatus(connected) {
  if (connected) {
    connectionStatus.classList.add("connected");
    connectionText.textContent = "Connected";
  } else {
    connectionStatus.classList.remove("connected");
    connectionText.textContent = "Disconnected";
  }
}

function sendWebSocketMessage(type, content) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.error("WebSocket not connected");
    return;
  }

  try {
    ws.send(JSON.stringify({ type, content }));
    console.log("[Send] type=" + type + ", length=" + String(content).length);
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

// ==================== UI ====================

function showProcessingIndicator() {
  tokenCountValue = 0;
  tokenCount.textContent = "0";
  processingStartTime = Date.now();
  processingIndicator.style.display = "block";

  if (processingTimerInterval) clearInterval(processingTimerInterval);
  processingTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - processingStartTime) / 1000);
    processingTimer.textContent = elapsed + "s";
  }, 1000);

  scrollToBottom();
}

function hideProcessingIndicator() {
  processingIndicator.style.display = "none";
  if (processingTimerInterval) {
    clearInterval(processingTimerInterval);
    processingTimerInterval = null;
  }
}

function addUserMessage(text) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message user";
  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.textContent = text;
  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  scrollToBottom();
}

function addAssistantToken(token) {
  if (tokenCountValue === 0 && token) {
    hideProcessingIndicator();
  }

  let lastMessage = messagesContainer.lastElementChild;

  if (!lastMessage || !lastMessage.classList.contains("assistant")) {
    lastMessage = document.createElement("div");
    lastMessage.className = "message assistant";
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";
    const textSpan = document.createElement("span");
    textSpan.className = "message-text";
    textSpan.textContent = "";
    contentDiv.appendChild(textSpan);
    lastMessage.appendChild(contentDiv);
    messagesContainer.appendChild(lastMessage);
  }

  const textSpan = lastMessage.querySelector(".message-text");
  if (textSpan) {
    textSpan.textContent += token;
  }

  scrollToBottom();
}

function addSystemMessage(text) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message system";
  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.textContent = text;
  messageDiv.appendChild(contentDiv);
  messagesContainer.appendChild(messageDiv);
  scrollToBottom();
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ==================== BUTTON HANDLERS ====================

connectBtn.addEventListener("click", () => {
  if (isConnected) {
    disconnectWebSocket();
  } else {
    connectWebSocket();
  }
});

resetBtn.addEventListener("click", () => {
  if (isConnected) {
    sendWebSocketMessage("reset", "");
    messagesContainer.innerHTML = "";
    addSystemMessage("Conversation reset");
  }
});

testBtn.addEventListener("click", async () => {
  addSystemMessage("Testing Ollama...");
  testBtn.disabled = true;

  try {
    const response = await fetch("http://localhost:8000/test-ollama");
    const result = await response.json();

    if (result.status === "success") {
      addSystemMessage(
        "✅ Ollama test successful!\nModel: " +
          result.model +
          "\nTokens: " +
          result.tokens_count +
          "\nResponse: " +
          result.response,
      );
    } else {
      addSystemMessage(
        "❌ Ollama test failed: " + (result.error || result.message),
      );
    }
  } catch (error) {
    addSystemMessage("❌ Could not reach server: " + error.message);
  } finally {
    testBtn.disabled = false;
  }
});

sendBtn.addEventListener("click", async () => {
  const textMessage = textInput.value.trim();

  if (!textMessage) {
    return;
  }

  if (!isConnected) {
    addSystemMessage("Not connected. Please connect first.");
    return;
  }

  if (visionEnabled) {
    currentImageData = captureImage();
  }

  addUserMessage(textMessage);
  showProcessingIndicator();

  if (visionEnabled && currentImageData) {
    sendWebSocketMessage("image", currentImageData);
  }

  sendWebSocketMessage("text", textMessage);

  textInput.value = "";
  textInput.focus();
});

textInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

cameraSelect.addEventListener("change", () => {
  initializeCamera();
});
