/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Content, Type } from '@google/genai';
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
const initialChatForm = document.getElementById(
  'initial-chat-form'
) as HTMLFormElement;
const initialPromptInput = document.getElementById(
  'initial-prompt-input'
) as HTMLTextAreaElement;
const startWeavingBtn = document.getElementById(
  'start-weaving-btn'
) as HTMLButtonElement;
const saveStatusElement = document.getElementById(
  'save-status'
) as HTMLSpanElement;
const genreSelection = document.getElementById(
  'genre-selection'
) as HTMLDivElement;
const customGenreWrapper = document.getElementById(
  'custom-genre-wrapper'
) as HTMLDivElement;
const customGenreInput = document.getElementById(
  'custom-genre-input'
) as HTMLInputElement;

// --- App State ---
let ai: GoogleGenAI;
let currentHistory: Content[] = [];
let currentChatTitle: string | null = null;
let currentSystemInstruction: string = DEFAULT_SYSTEM_INSTRUCTION;
let saveTimeoutId: number;

// --- Helper Functions ---

interface ChatData {
  history: Content[];
  systemInstruction: string;
}

function scheduleSave() {
  // Clear any pending save
  clearTimeout(saveTimeoutId);
  saveStatusElement.classList.remove('visible');
  saveStatusElement.textContent = '';

  // Schedule a new save after 1.5 seconds of inactivity
  saveTimeoutId = window.setTimeout(() => {
    if (!currentChatTitle) return;

    saveStatusElement.textContent = 'Saving...';
    saveStatusElement.classList.add('visible');

    saveChatData(currentChatTitle, currentHistory, currentSystemInstruction);

    // Give feedback that save is complete
    setTimeout(() => {
      saveStatusElement.textContent = 'Saved';
      // Keep "Saved" for a bit, then fade out
      setTimeout(() => {
        saveStatusElement.classList.remove('visible');
      }, 2000);
    }, 300); // Short delay to make "Saving..." noticeable
  }, 1500);
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
  sender: 'user' | 'model' | 'loading',
  suggestions?: string[]
) {
  // Before adding a new message, remove any existing regenerate/quick-reply buttons
  document.querySelector('.regenerate-button')?.parentElement?.remove();
  document.querySelector('.quick-replies')?.remove();

  const messageDiv = document.createElement('div');
  messageDiv.classList.add(
    'message',
    sender === 'user' ? 'user-message-container' : 'model-message-container'
  );

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

      contentContainer.appendChild(actionsContainer);
    }
  }
  chatContainer.appendChild(messageDiv);

  if (sender === 'model' && suggestions && suggestions.length > 0) {
    const repliesContainer = document.createElement('div');
    repliesContainer.className = 'quick-replies';

    for (const suggestion of suggestions) {
      const button = document.createElement('button');
      button.className = 'quick-reply-btn';
      button.textContent = suggestion;
      button.onclick = () => {
        sendMessage(suggestion);
        repliesContainer.remove();
      };
      repliesContainer.appendChild(button);
    }
    chatContainer.appendChild(repliesContainer);
  }

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
  currentHistory = [];
  currentChatTitle = null;
  localStorage.removeItem(CURRENT_CHAT_KEY);
  // Reset initial form
  if (initialPromptInput) initialPromptInput.value = '';
  if (startWeavingBtn) {
    startWeavingBtn.disabled = false;
    startWeavingBtn.innerHTML = 'Start Weaving';
  }
  // Reset genre selection
  genreSelection.querySelectorAll('.genre-btn').forEach((btn) => {
    const button = btn as HTMLButtonElement;
    if (button.dataset.genre === 'Default') {
      button.classList.add('selected');
    } else {
      button.classList.remove('selected');
    }
  });
  customGenreWrapper.style.display = 'none';
  customGenreInput.value = '';

  // Clear any pending saves and hide status
  clearTimeout(saveTimeoutId);
  if (saveStatusElement) {
    saveStatusElement.classList.remove('visible');
    saveStatusElement.textContent = '';
  }
}

// --- Core App Logic ---

async function generateTitle(prompt: string, genre: string): Promise<string> {
  try {
    const titlePrompt =
      genre === 'Default' || genre === ''
        ? `Generate a concise, evocative story title (max 5 words) for this prompt: "${prompt}". Respond with only the title, no extra text or quotes.`
        : `Generate a concise, evocative ${genre} story title (max 5 words) for this prompt: "${prompt}". Respond with only the title, no extra text or quotes.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: titlePrompt,
    });
    let title = response.text.trim().replace(/"/g, '');

    if (!title) {
      throw new Error('Generated title was empty.');
    }

    // Ensure title is unique
    const savedChats = getSavedChats();
    let finalTitle = title;
    let counter = 2;
    while (savedChats.includes(finalTitle)) {
      finalTitle = `${title} ${counter}`;
      counter++;
    }
    return finalTitle;
  } catch (error) {
    console.error('Failed to generate title:', error);
    // Fallback title
    return `Story from ${new Date().toLocaleDateString()}`;
  }
}

async function sendMessage(userMessage: string) {
  if (!currentChatTitle) return;

  // Remove any existing quick replies when a new message is sent
  document.querySelector('.quick-replies')?.remove();

  appendMessage(userMessage, 'user');
  const loadingIndicator = appendMessage('', 'loading');

  currentHistory.push({ role: 'user', parts: [{ text: userMessage }] });
  scheduleSave(); // Schedule save after user message is added to history

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      story_part: {
        type: Type.STRING,
        description:
          'The next part of the story, continuing from the user prompt.',
      },
      suggestions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          'Three short (3-5 word) and engaging suggestions for how the user could continue the story. These should be distinct and offer different paths.',
      },
    },
    required: ['story_part', 'suggestions'],
  };

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: currentHistory,
      config: {
        systemInstruction: `${currentSystemInstruction}\n\nIMPORTANT: Your entire response must be a single JSON object matching the defined schema. Do not include any other text, markdown, or formatting. The 'story_part' should be the creative story content, and 'suggestions' must be an array of three distinct strings.`,
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      },
    });

    loadingIndicator.remove();

    let storyPart = '';
    let suggestions: string[] = [];
    try {
      const jsonResponse = JSON.parse(response.text);
      storyPart =
        jsonResponse.story_part ||
        `Error: The model's response was not in the correct format. Here is the raw response: ${response.text}`;
      suggestions = jsonResponse.suggestions || [];
    } catch (e) {
      console.warn(
        'Response was not valid JSON, treating as plain text.',
        response.text
      );
      storyPart = response.text;
    }

    if (!storyPart) {
      throw new Error("API response is missing 'story_part'.");
    }

    appendMessage(storyPart, 'model', suggestions);

    currentHistory.push({ role: 'model', parts: [{ text: storyPart }] });
    scheduleSave(); // Schedule save after model response is added
  } catch (error) {
    handleApiError(error, loadingIndicator);
  }
}

async function regenerateLastResponse() {
  if (currentHistory.length < 2) return;

  // 1. Update the DOM by removing the last user and model messages & replies.
  const modelMessages = document.querySelectorAll('.model-message-container');
  modelMessages[modelMessages.length - 1]?.remove();
  const userMessages = document.querySelectorAll('.user-message-container');
  userMessages[userMessages.length - 1]?.remove();
  document.querySelector('.quick-replies')?.remove();

  // 2. Remove the last turn from history.
  currentHistory.pop(); // remove model response
  const lastUserTurn = currentHistory.pop(); // remove user message
  if (!lastUserTurn) return;

  const lastUserMessage = lastUserTurn.parts.map((p) => p.text).join('');

  // 3. Re-send the last user message to get a new response.
  await sendMessage(lastUserMessage);
}

async function loadChat(title: string) {
  currentChatTitle = title;
  localStorage.setItem(CURRENT_CHAT_KEY, title);
  chatTitleElement.textContent = title;
  chatContainer.innerHTML = ''; // Clear the container
  initialMessage.style.display = 'none';
  chatForm.style.display = 'flex';
  chatInput.focus();

  const { history, systemInstruction } = getChatData(title);
  currentSystemInstruction = systemInstruction;
  currentHistory = history;

  for (const message of history) {
    const text = message.parts.map((part) => part.text).join('');
    appendMessage(text, message.role as 'user' | 'model');
  }

  // The very first message in a new chat has no suggestions
  if (history.length === 0) {
    appendMessage(
      'Greetings, traveler! What story shall we weave today? Give me a prompt, and a tale will unfold.',
      'model'
    );
  } else {
    // For existing chats, we need to generate suggestions for the last message
    const lastMessage = history[history.length - 1];
    if (lastMessage && lastMessage.role === 'model') {
      // To provide a consistent experience, we could regenerate suggestions here,
      // but for simplicity, we'll only show them on new messages.
    }
  }

  settingsBtn.disabled = false;
}

function startNewChat() {
  showInitialState();
}

// --- Modal Logic ---
function openSettingsModal() {
  if (!currentChatTitle) return;
  systemInstructionInput.value = currentSystemInstruction;
  settingsModal.classList.add('show');
}

function closeSettingsModal() {
  settingsModal.classList.remove('show');
}

async function saveSettings() {
  if (!currentChatTitle) return;

  const newInstruction = systemInstructionInput.value.trim();
  if (!newInstruction) {
    alert('System instruction cannot be empty.');
    return;
  }

  currentSystemInstruction = newInstruction;

  saveChatData(currentChatTitle, currentHistory, currentSystemInstruction);
  await loadChat(currentChatTitle); // Reload to apply changes immediately
  closeSettingsModal();
}

// --- Initialization ---

async function initializeApp() {
  if (!API_KEY) {
    showInitialState();
    const errorContainer = document.createElement('div');
    chatContainer.appendChild(errorContainer);
    appendMessage(
      '<strong>Error:</strong> API key not found. Please set the API_KEY environment variable.',
      'model'
    );
    return;
  }

  ai = new GoogleGenAI({ apiKey: API_KEY as string });

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

  genreSelection.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('genre-btn')) {
      genreSelection
        .querySelectorAll('.genre-btn')
        .forEach((btn) => btn.classList.remove('selected'));
      target.classList.add('selected');

      const genre = target.dataset.genre;
      if (genre === 'Custom') {
        customGenreWrapper.style.display = 'block';
        customGenreInput.focus();
      } else {
        customGenreWrapper.style.display = 'none';
      }
    }
  });

  initialChatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userMessage = initialPromptInput.value.trim();
    if (!userMessage) {
      alert('Please enter a prompt to start your story.');
      return;
    }

    startWeavingBtn.disabled = true;
    startWeavingBtn.innerHTML =
      '<span class="spinner"></span>Starting Story...';

    // Get genre
    const selectedGenreBtn = genreSelection.querySelector(
      '.genre-btn.selected'
    ) as HTMLButtonElement;
    let genre = selectedGenreBtn.dataset.genre || 'Default';
    if (genre === 'Custom') {
      genre = customGenreInput.value.trim() || 'Default';
    }

    // Create system instruction
    const systemInstruction =
      genre === 'Default' || genre === ''
        ? DEFAULT_SYSTEM_INSTRUCTION
        : `You are a master storyteller specializing in ${genre}. Your goal is to weave imaginative and engaging tales for the user. When the user gives you a prompt, turn it into a captivating story in the ${genre} style.`;

    const title = await generateTitle(userMessage, genre);
    saveNewChatTitle(title);
    saveChatData(title, [], systemInstruction);
    updateSavedChatsDropdown();
    await loadChat(title);
    // The first message is now the user's initial prompt
    await sendMessage(userMessage);
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
