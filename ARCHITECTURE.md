# Project Architecture & AI Integration

## Front-End Architecture
The Virtual Courtroom is built entirely as a client-side **React Single Page Application (SPA)** using Vite. 
- State management (`useState`) handles the sequencing of the 11-phase trial `targetPhase`.
- `useEffect` hooks automatically scroll the chat transcript container as new text is generated.
- The `processAgentTurn` acts as the primary controller orchestrating API calls based on the `AGENT_CONFIGS` dictionary.

## Multi-Agent LLM Routing
Different roles in the courtroom require distinct temperaments and analytical capabilities. We leverage a multi-model architecture to force diverse interactions:

1. **Judge**: `gemini-2.5-flash` (via Google Gemini API). Formal, directive, and succinct.
2. **Witness**: `llama3` (via local Ollama). Nervous, defensive, heavily prompted to hide exactly one contradiction.
3. **Prosecutor**: `gemini-2.5-flash` (via Google Gemini API). Aggressive, analytical, dissects transcripts ruthlessly.
4. **Defense**: `phi3` (via local Ollama). Empathetic, extremely sharp legal defense.
5. **Jury (Mix)**: The `mix` setting fires three concurrent asynchronous requests (`Promise.all` logic via `safeFetch`) to LLaMA3, Mistral-Small, and Phi-3, combining their outputs for a true "multi-voice" jury construct deliberation.

## Data Flow
1. **Context Initialization**: `AGENT_CONFIGS` dictates the strict system instructions (e.g., *maximum 2-3 sentences*).
2. **History Appending**: All spoken words are appended to a state array `transcript`. 
3. **Turn Execution**: On the next step, the entire `transcript` is joined into a string and passed to the active LLM as `historyPrompt` so the LLM has complete context of the trial's state.

---

## Glossary of AI Terms Used

- **LLM (Large Language Model)**: The core AI engine (e.g., Gemini, LLaMA3) capable of understanding natural language and generating contextually relevant spoken text.
- **Agent / Multi-Agent System**: Independent AI instances, each armed with completely isolated instructions (System Prompts) and goals, communicating with each other sequentially through a shared transcript.
- **System Prompt**: A persistent "hidden" set of instructions given to the LLM to govern its persona, tone, rules, and alignment before it answers the user's prompt. 
- **Inference**: The process of the AI actively generating a response to a prompt. *Local inference* means running this process on your own CPU/GPU (via Ollama) rather than in the cloud.
- **Ollama**: An open-source local framework that allows massive LLMs (like Llama3 and Phi3) to run securely and privately directly on user hardware.
- **Max Output Tokens**: A hard limit imposed on the LLM restricting how much text it can generate. (We increased this to `2048` to prevent responses from being cut off mid-sentence).
- **Prompt Engineering**: The strategic crafting of instructions to elicit specific behavior. For example, using "Chaos Mode" configures the Jury's system prompt to act as three fractured, overlapping personalities.
