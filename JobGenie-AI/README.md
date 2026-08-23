# JobGenie-AI

## LLM Selection and Fallback

JobGenie-AI supports dynamic selection and fallback for Large Language Models (LLMs). You can use OpenAI (cloud), Ollama (local open-source), or Mistral (local open-source). The system will try your preferred provider, and if unavailable, will gracefully fallback to the next available option.

### Configuration

Set the following variables in your `.env` file:

```
# OpenAI API Key (if using OpenAI)
OPENAI_API_KEY=your-openai-key

# LLM Provider Selection
# Options: openai, ollama, mistral, auto (auto = try OpenAI, then Ollama, then Mistral)
LLM_PROVIDER=auto

# LLM Model (for OpenAI or open-source)
LLM_MODEL=gpt-4
LLM_TEMPERATURE=0.7

# Ollama (open-source LLM) configuration
OLLAMA_URL=http://localhost:11434

# Mistral (open-source LLM) configuration
MISTRAL_URL=http://localhost:8080
```

- If `LLM_PROVIDER=auto`, the system will try OpenAI first (if `OPENAI_API_KEY` is set), then Ollama, then Mistral.
- If you want to force a specific provider, set `LLM_PROVIDER` to `openai`, `ollama`, or `mistral`.
- Make sure the corresponding service (Ollama or Mistral) is running if you select them.

### Troubleshooting
- If no LLM is available, the service will log an error and fail to start.
- Check your API keys and that local LLM services are running on the correct ports.
- Logs will indicate which LLM provider is being used or if a fallback occurred. 

## Testing LLM Fallback Logic

You can test the LLM fallback logic by changing your `.env` and service availability:

### 1. OpenAI Available
- Set `OPENAI_API_KEY` and `LLM_PROVIDER=auto` (or `openai`).
- Start the service. It should use OpenAI (see logs: `Using OpenAI LLM`).

### 2. OpenAI Unavailable, Ollama Running
- Remove or comment out `OPENAI_API_KEY`.
- Start Ollama (`ollama serve`), set `LLM_PROVIDER=auto` (or `ollama`).
- Start the service. It should use Ollama (see logs: `Using Ollama LLM`).

### 3. Only Mistral Running
- Remove `OPENAI_API_KEY` and stop Ollama.
- Start Mistral (see docs for running Mistral server), set `LLM_PROVIDER=auto` (or `mistral`).
- Start the service. It should use Mistral (see logs: `Using Mistral LLM`).

### 4. No LLM Available
- If no provider is available, the service will log an error and fail to start.

**Check logs for lines like:**
- `Using OpenAI LLM: gpt-4`
- `Using Ollama LLM (open-source) at http://localhost:11434`
- `Using Mistral LLM (open-source) at http://localhost:8080`
- `No available LLM provider could be initialized. Please check your configuration.`

**Troubleshooting:**
- Ensure the correct ports and URLs are set in `.env`.
- Ensure the required Python packages for open-source LLMs are installed (`langchain_community`).
- Check for typos in `.env` variable names. 