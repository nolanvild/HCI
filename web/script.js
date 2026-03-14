/**
 * Real-time AI Agent Interface
 * Handles WebSocket communication, media capture, and conversation streaming
 */

// ==================== DOM ELEMENTS ====================
const messagesContainer = document.getElementById("messagesContainer");
const textInput = document.getElementById("textInput");
const sendBtn = document.getElementById("sendBtn");
const connectBtn = document.getElementById("connectBtn");
const resetBtn = document.getElementById("resetBtn");
const connectionStatus = document.getElementById("connectionStatus");
const connectionText = document.getElementById("connectionText");

const videoPreview = document.getElementById("videoPreview");
const captureBtn = document.getElementById("captureBtn");
const recordingIndicator = document.getElementById("recordingIndicator");
const statusText = document.getElementById("statusText");
const latestMediaSection = document.getElementById("latestMediaSection");
const latestMediaContainer = document.getElementById("latestMediaContainer");
const imagesGrid = document.getElementById("imagesGrid");
const mediaHistory = document.getElementById("mediaHistory");
const toggleHistory = document.getElementById("toggleHistory");
const historyContent = document.getElementById("historyContent");

// ==================== STATE ====================
let ws = null;
let stream = null;
let mediaRecorder = null;
let isRecording = false;
let audioChunks = [];
let currentImageData = null;
let isConnected = false;
let capturedImages = [];

// ==================== INITIALIZATION ====================
async function initializeCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false,
    });
    videoPreview.srcObject = stream;
    statusText.textContent = "Camera ready";
  } catch (error) {
    console.error("Error accessing camera:", error);
    statusText.textContent =
      "Error: Could not access camera. Please check permissions.";
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
    sendBtn.disabled = false;
    resetBtn.disabled = false;
    connectBtn.textContent = "Disconnect";
    connectBtn.classList.add("connected");
    addSystemMessage("Connected to AI. Ready to chat!");
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleWebSocketMessage(data);
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    addSystemMessage("Connection error: " + error);
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
  } catch (error) {
    console.error("Error sending WebSocket message:", error);
  }
}

function handleWebSocketMessage(data) {
  const { type, content } = data;

  switch (type) {
    case "response":
      // Streaming response from AI
      addAssistantMessageToken(content);
      break;

    case "status":
      addSystemMessage(content);
      break;

    case "error":
      addSystemMessage(`Error: ${content}`);
      break;

    default:
      console.warn("Unknown message type:", type);
  }
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
  // Get or create the last assistant message
  let lastMessage = messagesContainer.lastElementChild;

  if (!lastMessage || !lastMessage.classList.contains("assistant")) {
    // Create new assistant message
    lastMessage = document.createElement("div");
    lastMessage.className = "message assistant";

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content streaming";
    contentDiv.textContent = "";

    lastMessage.appendChild(contentDiv);
    messagesContainer.appendChild(lastMessage);
  }

  // Append token to content
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

// ==================== TEXT INPUT & SENDING ====================
sendBtn.addEventListener("click", sendText);
textInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendText();
  }
});

function sendText() {
  const text = textInput.value.trim();
  if (!text) return;

  if (!isConnected) {
    alert("Not connected. Please connect first.");
    return;
  }

  addUserMessage(text);
  sendWebSocketMessage("text", text);
  textInput.value = "";
  textInput.focus();
}

// ==================== CAMERA & AUDIO CAPTURE ====================
function captureImage() {
  const canvas = document.createElement("canvas");
  canvas.width = videoPreview.videoWidth;
  canvas.height = videoPreview.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoPreview, 0, 0);
  return canvas.toDataURL("image/jpeg");
}

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

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      await processAudioRecording(audioBlob);
    };

    mediaRecorder.start();
    isRecording = true;
    return true;
  } catch (error) {
    console.error("Error starting audio recording:", error);
    statusText.textContent = "Error: Could not access microphone.";
    return false;
  }
}

function stopAudioRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  }
}

async function processAudioRecording(audioBlob) {
  // Send to server for transcription
  try {
    statusText.textContent = "Transcribing audio...";

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
    const transcript = data.transcript;

    statusText.textContent = `Transcribed: ${transcript.substring(0, 50)}...`;

    // Send transcript to AI
    const audioUrl = URL.createObjectURL(audioBlob);
    addMediaToLatest(currentImageData, audioUrl, transcript);

    // Send to WebSocket
    if (isConnected && transcript.trim()) {
      sendWebSocketMessage("transcript", transcript);
    }
  } catch (error) {
    console.error("Error processing audio:", error);
    statusText.textContent = "Error: Could not transcribe audio.";
  }
}

// ==================== MEDIA DISPLAY ====================
function addMediaToLatest(imageData, audioUrl, transcript) {
  latestMediaSection.style.display = "block";
  latestMediaContainer.innerHTML = "";

  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.gap = "12px";

  // Image
  if (imageData) {
    const img = document.createElement("img");
    img.src = imageData;
    img.style.cssText =
      "width: 80px; height: 80px; border-radius: 6px; object-fit: cover;";
    container.appendChild(img);

    // Send image to WebSocket
    if (isConnected) {
      sendWebSocketMessage("image", imageData);
    }
  }

  // Audio and transcript
  const audioSection = document.createElement("div");
  audioSection.style.flex = "1";

  if (audioUrl) {
    const audio = document.createElement("audio");
    audio.src = audioUrl;
    audio.controls = true;
    audio.style.width = "100%";
    audioSection.appendChild(audio);
  }

  if (transcript) {
    const label = document.createElement("div");
    label.style.cssText = "font-size: 11px; color: #667eea; margin-top: 8px;";
    label.textContent = "TRANSCRIPT";

    const text = document.createElement("div");
    text.style.cssText =
      "font-size: 12px; color: #555; background: #fafafa; padding: 8px; border-radius: 4px; border-left: 2px solid #667eea; margin-top: 4px;";
    text.textContent = transcript;

    audioSection.appendChild(label);
    audioSection.appendChild(text);
  }

  container.appendChild(audioSection);
  latestMediaContainer.appendChild(container);

  // Also add to history
  addMediaToGallery(imageData, audioUrl, transcript);
}

function addMediaToGallery(imageData, audioUrl, transcript = null) {
  const captureItem = document.createElement("div");
  captureItem.className = "capture-item";

  // Small image
  if (imageData) {
    const img = document.createElement("img");
    img.src = imageData;
    img.className = "captured-image";
    img.title = `Captured at ${new Date().toLocaleTimeString()}`;
    captureItem.appendChild(img);
  }

  // Audio and transcript
  const audioContainer = document.createElement("div");
  audioContainer.className = "capture-audio";

  if (audioUrl) {
    const audio = document.createElement("audio");
    audio.src = audioUrl;
    audio.controls = true;
    audio.className = "audio-player";
    audioContainer.appendChild(audio);
  }

  const timestamp = document.createElement("div");
  timestamp.className = "audio-timestamp";
  timestamp.textContent = `${new Date().toLocaleTimeString()}`;
  audioContainer.appendChild(timestamp);

  if (transcript) {
    const section = document.createElement("div");
    section.className = "transcript-section";

    const label = document.createElement("div");
    label.className = "transcript-label";
    label.textContent = "Transcript";

    const text = document.createElement("div");
    text.className = "transcript-text";
    text.textContent = transcript;

    section.appendChild(label);
    section.appendChild(text);
    audioContainer.appendChild(section);
  }

  captureItem.appendChild(audioContainer);
  imagesGrid.insertBefore(captureItem, imagesGrid.firstChild);

  capturedImages.push({ imageData, audioUrl, transcript });
}

// ==================== CAPTURE BUTTON LOGIC ====================
captureBtn.addEventListener("click", async () => {
  if (!isRecording) {
    // Start
    try {
      currentImageData = captureImage();
      const success = await startAudioRecording();
      if (success) {
        captureBtn.textContent = "Stop Recording";
        recordingIndicator.classList.add("recording");
        statusText.textContent = "Recording audio...";
      }
    } catch (error) {
      console.error("Error capturing:", error);
      statusText.textContent = "Error: Could not start capture.";
    }
  } else {
    // Stop
    stopAudioRecording();
    captureBtn.textContent = "Start";
    recordingIndicator.classList.remove("recording");
    statusText.textContent = "Recording stopped";
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

// ==================== MEDIA HISTORY TOGGLE ====================
toggleHistory.addEventListener("click", () => {
  if (historyContent.style.display === "none") {
    historyContent.style.display = "block";
    toggleHistory.classList.add("expanded");
  } else {
    historyContent.style.display = "none";
    toggleHistory.classList.remove("expanded");
  }
});
