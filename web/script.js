/**
 * Real-time AI Agent Interface - Unified Multi-Modal Capture
 * Single button captures image + audio simultaneously
 * Text input combined with media and sent to AI
 */

// ==================== DOM ELEMENTS ====================
const messagesContainer = document.getElementById("messagesContainer");
const textInput = document.getElementById("textInput");
const captureBtn = document.getElementById("captureBtn");
const captureStatus = document.getElementById("captureStatus");
const connectBtn = document.getElementById("connectBtn");
const resetBtn = document.getElementById("resetBtn");
const connectionStatus = document.getElementById("connectionStatus");
const connectionText = document.getElementById("connectionText");
const loadingIndicator = document.getElementById("loadingIndicator");

const videoPreview = document.getElementById("videoPreview");
const recordingIndicator = document.getElementById("recordingIndicator");
const statusText = document.getElementById("statusText");

// ==================== STATE ====================
let ws = null;
let stream = null;
let mediaRecorder = null;
let isRecording = false;
let audioChunks = [];
let currentImageData = null;
let isConnected = false;
let captureInterval = null;

// ==================== INITIALIZATION ====================
async function initializeCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    videoPreview.srcObject = stream;
    statusText.textContent = "Ready";
    captureBtn.disabled = false;
  } catch (error) {
    console.error("Error accessing camera:", error);
    statusText.textContent = "Error: Camera access denied";
    captureBtn.disabled = true;
  }
}

window.addEventListener("load", initializeCamera);

// ==================== WEBSOCKET MANAGEMENT ====================
function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected");
    isConnected = true;
    updateConnectionStatus(true);
    textInput.disabled = false;
    captureBtn.disabled = false;
    resetBtn.disabled = false;
    connectBtn.textContent = "Disconnect";
    connectBtn.classList.add("connected");
    addSystemMessage("Connected to AI");
  };

  ws.onmessage = (event) => {
    try {
      // Handle both JSON and plain text messages
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        // If not JSON, treat as plain text status message
        console.warn("Received non-JSON message:", event.data);
        data = { type: "status", content: event.data };
      }
      handleWebSocketMessage(data);
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
    captureBtn.disabled = true;
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
  } catch (error) {
    console.error("Error sending WebSocket message:", error);
  }
}

function handleWebSocketMessage(data) {
  const { type, content } = data;

  switch (type) {
    case "response":
      // Hide loading indicator on first response
      hideLoadingIndicator();
      addAssistantMessageToken(content);
      break;
    case "status":
      addSystemMessage(content);
      break;
    case "error":
      hideLoadingIndicator();
      addSystemMessage(`Error: ${content}`);
      break;
    default:
      console.warn("Unknown message type:", type);
  }
}

// ==================== LOADING INDICATOR ====================
function showLoadingIndicator() {
  loadingIndicator.style.display = "flex";
  scrollToBottom();
}

function hideLoadingIndicator() {
  loadingIndicator.style.display = "none";
}

// ==================== MESSAGE DISPLAY ====================
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

function addAssistantMessageToken(token) {
  let lastMessage = messagesContainer.lastElementChild;

  if (!lastMessage || !lastMessage.classList.contains("assistant")) {
    lastMessage = document.createElement("div");
    lastMessage.className = "message assistant";
    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content streaming";
    contentDiv.textContent = "";
    lastMessage.appendChild(contentDiv);
    messagesContainer.appendChild(lastMessage);
  }

  const contentDiv = lastMessage.querySelector(".message-content");
  contentDiv.textContent += token;
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

// ==================== UNIFIED CAPTURE SYSTEM ====================

// Capture image from video
function captureImage() {
  const canvas = document.createElement("canvas");
  canvas.width = videoPreview.videoWidth;
  canvas.height = videoPreview.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoPreview, 0, 0);
  return canvas.toDataURL("image/jpeg");
}

// Start audio recording
async function startAudioRecording() {
  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    mediaRecorder = new MediaRecorder(audioStream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };

    mediaRecorder.start();
    isRecording = true;
    return true;
  } catch (error) {
    console.error("Error starting audio recording:", error);
    statusText.textContent = "Microphone access denied";
    return false;
  }
}

// Stop audio recording and get the blob
function stopAudioRecording() {
  return new Promise((resolve) => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
        isRecording = false;
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        resolve(audioBlob);
      };
      mediaRecorder.stop();
    } else {
      resolve(null);
    }
  });
}

// Transcribe audio
async function transcribeAudio(audioBlob) {
  try {
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.wav");

    const response = await fetch("http://localhost:8000/transcribe", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Transcription failed");
    }

    const data = await response.json();
    return data.transcript || "";
  } catch (error) {
    console.error("Error transcribing audio:", error);
    return "";
  }
}

// UNIFIED CAPTURE BUTTON HANDLER
captureBtn.addEventListener("click", async () => {
  if (!isRecording) {
    // ===== START CAPTURE =====
    if (!isConnected) {
      addSystemMessage("Not connected. Please connect first.");
      return;
    }

    try {
      // Start capturing image and audio
      currentImageData = captureImage();
      const success = await startAudioRecording();

      if (success) {
        isRecording = true;
        captureBtn.textContent = "Stop & Send";
        captureBtn.classList.add("recording");
        recordingIndicator.classList.add("active");
        captureStatus.textContent = "Recording...";
        statusText.textContent = "Recording - type a message and click Stop";
        textInput.focus();
      }
    } catch (error) {
      console.error("Error starting capture:", error);
      statusText.textContent = "Error starting capture";
    }
  } else {
    // ===== STOP CAPTURE & SEND =====
    captureBtn.disabled = true;
    captureStatus.textContent = "Processing...";

    try {
      // Stop audio recording
      const audioBlob = await stopAudioRecording();

      // Transcribe audio
      statusText.textContent = "Transcribing...";
      const transcript = await transcribeAudio(audioBlob);

      // Get text input
      const textMessage = textInput.value.trim();

      // Combine all inputs
      let allInputs = [];
      if (currentImageData) allInputs.push("(image captured)");
      if (transcript) allInputs.push(`Transcript: ${transcript}`);
      if (textMessage) allInputs.push(textMessage);

      const combinedMessage = allInputs.join(" ");

      // Send everything to AI
      if (combinedMessage) {
        addUserMessage(combinedMessage);
        showLoadingIndicator();

        // Send image if captured
        if (currentImageData) {
          sendWebSocketMessage("image", currentImageData);
        }

        // Send transcript if available
        if (transcript) {
          sendWebSocketMessage("transcript", transcript);
        }

        // Send text message if available
        if (textMessage) {
          sendWebSocketMessage("text", textMessage);
        }
      }

      // Reset UI
      isRecording = false;
      captureBtn.textContent = "Start Capture";
      captureBtn.classList.remove("recording");
      recordingIndicator.classList.remove("active");
      captureStatus.textContent = "Ready";
      statusText.textContent = "Ready";
      textInput.value = "";
      textInput.focus();
      captureBtn.disabled = false;
    } catch (error) {
      console.error("Error stopping capture:", error);
      statusText.textContent = "Error processing capture";
      captureBtn.disabled = false;
    }
  }
});

// ==================== CONNECTION BUTTONS ====================
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

// Allow Enter key in text input to send (when not capturing)
textInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey && isRecording) {
    // If capturing, just let them type normally
    return;
  }
});
