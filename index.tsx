/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Chat, Content } from '@google/genai';
import * as marked from 'marked';

// --- Constants ---
const API_KEY = process.env.API_KEY;
const SAVED_CHATS_KEY = 'gemini-story-saved-chats';
const CURRENT_CHAT_KEY = 'gemini-story-current-chat';
const HISTORY_KEY_PREFIX = 'gemini-story-history-';
const DEFAULT_SYSTEM_INSTRUCTION =
  'You are a master storyteller. Your goal is to weave imaginative and engaging tales for the user. When the user gives you a prompt, turn it into a captivating story.';

// --- DOM Elements ---
const chatContainer = document.getElementById(
  'chat-container'
) as HTMLDivElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const chatTitleElement = document.getElementById(
  'chat-title'
) as HTMLHeadingElement;
const initialMessage = document.getElementById(
  'initial-message'
) as HTMLDivElement;
const newChatBtn = document.getElementById('new-chat-btn') as HTMLButtonElement;
const savedChatsBtn = document.getElementById(
  'saved-chats-btn'
) as HTMLButtonElement;
const savedChatsList = document.getElementById(
  'saved-chats-list'
) as HTMLDivElement;
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const settingsModal = document.getElementById(
  'settings-modal'
) as HTMLDivElement;
const systemInstructionInput = document.getElementById(
  'system-instruction-input'
) as HTMLTextAreaElement;
const closeModalBtn = document.getElementById(
  'close-modal-btn'
) as HTMLButtonElement;
const saveSettingsBtn = document.getElementById(
  'save-settings-btn'
) as HTMLButtonElement;
const cancelSettingsBtn = document.getElementById(
  'cancel-settings-btn'
) as HTMLButtonElement;

// --- App State ---
let currentChat: Chat | null = null;
let currentChatTitle: string | null = null;
let currentSystemInstruction: string = DEFAULT_SYSTEM_INSTRUCTION;

// --- Helper Functions ---

interface ChatData {
  history: Content[];
  systemInstruction: string;
}

function getChatData(title: string): ChatData {
  const rawData = localStorage.getItem(`${HISTORY_KEY_PREFIX}${title}`);
  if (!rawData) {
    return {
      history: [],
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    };
  }
  try {
    const parsedData = JSON.parse(rawData);
    // Backward compatibility for old format (just an array of history)
    if (Array.isArray(parsedData)) {
      return {
        history: parsedData,
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
      };
    }
    // New format (object with history and systemInstruction)
    return {
      history: parsedData.history || [],
      systemInstruction:
        parsedData.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
    };
  } catch (error) {
    console.error('Failed to parse chat data:', error);
    return {
      history: [],
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    };
  }
}

function saveChatData(
  title: string,
  history: Content[],
  systemInstruction: string
) {
  const data: ChatData = { history, systemInstruction };
  localStorage.setItem(`${HISTORY_KEY_PREFIX}${title}`, JSON.stringify(data));
}

function appendMessage(
  content: string,
  sender: 'user' | 'model' | 'loading'
) {
  // Before adding a new message, remove any existing regenerate buttons
  document.querySelector('.regenerate-button')?.parentElement?.remove();

  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message');

  if (sender === 'loading') {
    messageDiv.classList.add('loading');
    messageDiv.innerHTML = `Thinking <span></span><span></span><span></span>`;
  } else {
    const contentContainer = document.createElement('div');
    contentContainer.classList.add(
      sender === 'user' ? 'user-message' : 'model-message'
    );
    contentContainer.innerHTML = marked.parse(content) as string;
    messageDiv.appendChild(contentContainer);

    if (sender === 'model' && content.trim().length > 0) {
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'message-actions';

      const copyButton = document.createElement('button');
      copyButton.className = 'copy-button';
      copyButton.setAttribute('aria-label', 'Copy message');
      copyButton.title = 'Copy message';

      const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
      const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 5 13"></polyline></svg>`;
      copyButton.innerHTML = copyIcon;

      copyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard
          .writeText(content)
          .then(() => {
            copyButton.innerHTML = checkIcon;
            copyButton.setAttribute('aria-label', 'Copied!');
            copyButton.classList.add('copied');
            setTimeout(() => {
              copyButton.innerHTML = copyIcon;
              copyButton.setAttribute('aria-label', 'Copy message');
              copyButton.classList.remove('copied');
            }, 2000);
          })
          .catch((err) => {
            console.error('Failed to copy text: ', err);
          });
      });
      actionsContainer.appendChild(copyButton);

      const regenerateButton = document.createElement('button');
      regenerateButton.className = 'regenerate-button';
      regenerateButton.setAttribute('aria-label', 'Regenerate response');
      regenerateButton.title = 'Regenerate response';
      const regenerateIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
      regenerateButton.innerHTML = regenerateIcon;
      regenerateButton.addEventListener('click', (e) => {
        e.stopPropagation();
        regenerateLastResponse();
      });
      actionsContainer.appendChild(regenerateButton);

      messageDiv.appendChild(actionsContainer);
    }
  }
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  return messageDiv;
}

function handleApiError(error: unknown, loadingIndicator: HTMLElement) {
  loadingIndicator.remove();
  let userFriendlyMessage =
    'An unexpected error occurred. Please try again later.';
  console.error('API Error:', error);

  if (error instanceof Error) {
    const message = error.message;
    const lowerCaseMessage = message.toLowerCase();
    if (lowerCaseMessage.includes('api key not valid')) {
      userFriendlyMessage =
        'Your API key is invalid. Please check your configuration.';
    } else if (lowerCaseMessage.includes('quota')) {
      userFriendlyMessage =
        'You have exceeded your API quota. Please check your usage and billing.';
    } else if (
      lowerCaseMessage.includes('network error') ||
      lowerCaseMessage.includes('failed to fetch')
    ) {
      userFriendlyMessage =
        'A network error occurred. Please check your internet connection and try again.';
    } else if (lowerCaseMessage.includes('400')) {
      userFriendlyMessage =
        'The request was malformed. This could be due to a safety policy violation. Please try rephrasing your prompt.';
    } else if (
      lowerCaseMessage.includes('500') ||
      lowerCaseMessage.includes('503')
    ) {
      userFriendlyMessage =
        'The service is temporarily unavailable. Please try again in a few moments.';
    } else {
      // Keep the original error message for other cases
      userFriendlyMessage = `Could not get a response. ${message}`;
    }
  }

  appendMessage(`<strong>Error:</strong> ${userFriendlyMessage}`, 'model');
}

function getSavedChats(): string[] {
  return JSON.parse(localStorage.getItem(SAVED_CHATS_KEY) || '[]');
}

function saveNewChatTitle(title: string) {
  const chats = getSavedChats();
  if (!chats.includes(title)) {
    chats.push(title);
    localStorage.setItem(SAVED_CHATS_KEY, JSON.stringify(chats));
  }
}

function updateSavedChatsDropdown() {
  const chats = getSavedChats();
  savedChatsList.innerHTML = '';
  if (chats.length === 0) {
    const noChatsEl = document.createElement('div');
    noChatsEl.className = 'no-chats';
    noChatsEl.textContent = 'No saved stories.';
    savedChatsList.appendChild(noChatsEl);
  } else {
    for (const title of chats) {
      const chatLink = document.createElement('a');
      chatLink.textContent = title;
      chatLink.addEventListener('click', () => {
        loadChat(title);
        savedChatsList.classList.remove('show');
      });
      savedChatsList.appendChild(chatLink);
    }
  }
}

function showInitialState() {
  chatTitleElement.textContent = 'The Narrator';
  initialMessage.style.display = 'block';
  chatForm.style.display = 'none';
  chatContainer.innerHTML = ''; // Clear any previous messages
  chatContainer.appendChild(initialMessage);
  settingsBtn.disabled = true;
  currentChat = null;
  currentChatTitle = null;
  localStorage.removeItem(CURRENT_CHAT_KEY);
}

// --- Core App Logic ---

async function sendMessage(userMessage: string) {
  if (!currentChat || !currentChatTitle) return;

  appendMessage(userMessage, 'user');
  const loadingIndicator = appendMessage('', 'loading');

  try {
    const response = await currentChat.sendMessage({ message: userMessage });
    loadingIndicator.remove();
    appendMessage(response.text, 'model');

    const updatedHistory = await currentChat.getHistory();
    saveChatData(
      currentChatTitle,
      updatedHistory,
      currentSystemInstruction
    );
  } catch (error) {
    handleApiError(error, loadingIndicator);
  }
}

async function regenerateLastResponse() {
  if (!currentChat || !currentChatTitle) return;

  // 1. Get history and identify the last turn.
  const fullHistory = await currentChat.getHistory();
  if (
    fullHistory.length < 2 ||
    fullHistory[fullHistory.length - 1].role !== 'model'
  ) {
    return; // Cannot regenerate if the last message isn't from the model.
  }

  const lastUserMessageContent = fullHistory[fullHistory.length - 2].parts
    .map((p) => p.text)
    .join('');
  const historyWithoutLastTurn = fullHistory.slice(0, -2);

  // 2. Update the DOM by removing the last user and model messages.
  document
    .querySelector('.model-message:last-of-type')
    ?.closest('.message')
    ?.remove();
  document
    .querySelector('.user-message:last-of-type')
    ?.closest('.message')
    ?.remove();

  // 3. Re-initialize the chat with the truncated history.
  const ai = new GoogleGenAI({ apiKey: API_KEY as string });
  currentChat = ai.chats.create({
    model: 'gemini-flash-lite-latest',
    history: historyWithoutLastTurn,
    config: {
      systemInstruction: currentSystemInstruction,
    },
  });

  // 4. Re-send the last user message to get a new response.
  await sendMessage(lastUserMessageContent);
}

async function loadChat(title: string) {
  if (!API_KEY) return;

  currentChatTitle = title;
  localStorage.setItem(CURRENT_CHAT_KEY, title);
  chatTitleElement.textContent = title;
  chatContainer.innerHTML = ''; // Clear the container
  initialMessage.style.display = 'none';
  chatForm.style.display = 'flex';
  chatInput.focus();

  const { history, systemInstruction } = getChatData(title);
  currentSystemInstruction = systemInstruction;

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  currentChat = ai.chats.create({
    model: 'gemini-flash-lite-latest',
    history: history,
    config: {
      systemInstruction: currentSystemInstruction,
    },
  });

  for (const message of history) {
    const text = message.parts.map((part) => part.text).join('');
    appendMessage(text, message.role as 'user' | 'model');
  }

  if (history.length === 0) {
    appendMessage(
      'Greetings, traveler! What story shall we weave today? Give me a prompt, and a tale will unfold.',
      'model'
    );
  }
  settingsBtn.disabled = false;
}

function startNewChat() {
  const title = prompt(
    'Enter a title for your new story:',
    'My Magical Adventure'
  );
  if (!title || title.trim() === '') {
    alert('Story title cannot be empty.');
    return;
  }
  const trimmedTitle = title.trim();
  if (getSavedChats().includes(trimmedTitle)) {
    alert('A story with this title already exists. Please choose another.');
    return;
  }

  saveNewChatTitle(trimmedTitle);
  saveChatData(trimmedTitle, [], DEFAULT_SYSTEM_INSTRUCTION);
  updateSavedChatsDropdown();
  loadChat(trimmedTitle);
}

// --- Modal Logic ---
function openSettingsModal() {
  if (!currentChat) return;
  systemInstructionInput.value = currentSystemInstruction;
  settingsModal.classList.add('show');
}

function closeSettingsModal() {
  settingsModal.classList.remove('show');
}

async function saveSettings() {
  if (!currentChat || !currentChatTitle) return;

  const newInstruction = systemInstructionInput.value.trim();
  if (!newInstruction) {
    alert('System instruction cannot be empty.');
    return;
  }

  currentSystemInstruction = newInstruction;

  const history = await currentChat.getHistory();
  saveChatData(currentChatTitle, history, currentSystemInstruction);

  // Re-initialize the chat with the new instruction.
  await loadChat(currentChatTitle);

  closeSettingsModal();
}

// --- Initialization ---

async function initializeApp() {
  if (!API_KEY) {
    showInitialState();
    // The initial-message div is hidden by default, so we need to manually add the error message
    const errorContainer = document.createElement('div');
    chatContainer.appendChild(errorContainer);
    appendMessage(
      '<strong>Error:</strong> API key not found. Please set the API_KEY environment variable.',
      'model'
    );
    return;
  }

  // Event Listeners
  newChatBtn.addEventListener('click', startNewChat);

  settingsBtn.addEventListener('click', openSettingsModal);
  closeModalBtn.addEventListener('click', closeSettingsModal);
  cancelSettingsBtn.addEventListener('click', closeSettingsModal);
  saveSettingsBtn.addEventListener('click', saveSettings);
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });

  savedChatsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    updateSavedChatsDropdown();
    savedChatsList.classList.toggle('show');
  });

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMessage = chatInput.value.trim();
    if (!userMessage) return;

    sendButton.classList.add('sending');
    sendButton.addEventListener(
      'animationend',
      () => {
        sendButton.classList.remove('sending');
      },
      { once: true }
    );

    chatInput.value = '';
    await sendMessage(userMessage);
  });

  // Close dropdown when clicking outside
  window.addEventListener('click', (event) => {
    if (
      !savedChatsBtn.contains(event.target as Node) &&
      savedChatsList.classList.contains('show')
    ) {
      savedChatsList.classList.remove('show');
    }
  });

  // Initial load
  const lastChat = localStorage.getItem(CURRENT_CHAT_KEY);
  if (lastChat && getSavedChats().includes(lastChat)) {
    loadChat(lastChat);
  } else {
    showInitialState();
  }
  updateSavedChatsDropdown();
}

initializeApp();