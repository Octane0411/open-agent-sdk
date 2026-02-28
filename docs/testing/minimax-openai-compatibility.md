# MiniMax OpenAI Compatibility Test Results

**Date:** 2026-02-28
**Test Suite:** `packages/core/tests/e2e/providers/openai.test.ts`
**MiniMax API Version:** OpenAI-compatible endpoint v1

## Summary

✅ **All 11 OpenAI E2E tests passed** when using MiniMax's OpenAI-compatible API endpoint.

This validates:
1. MiniMax's OpenAI API compatibility
2. Our SDK's `OpenAIProvider` implementation with OpenAI-compatible endpoints
3. Error handling and edge cases

## Configuration

```bash
OPENAI_API_KEY=sk-api-9iGiwBw3My4CY78EQflkTNVMjk3B3gT8jnUklkwix5MV5cNtN_9tHz_No4laGxHT2iJ83wXr2cD9mUPJ2ekQD8aC2S7daHtZWTZK3zbFxEaQkqG37UihNB8
OPENAI_BASE_URL=https://api.minimaxi.com/v1
OPENAI_MODEL=MiniMax-M2.5
```

## Test Results

### Passed Tests (11/11)

1. ✅ **Basic Connectivity**
   - Simple response generation
   - Usage tracking (input/output tokens)

2. ✅ **Tool Calling**
   - Single tool execution
   - No tool when not needed

3. ✅ **Streaming**
   - Content chunks streaming
   - Done event signaling

4. ✅ **System Prompt**
   - Instruction respect and following

5. ✅ **Abort Signal**
   - Mid-stream cancellation
   - Pre-aborted request handling

6. ✅ **Multi-turn Conversation**
   - Context retention across messages

7. ✅ **Error Handling**
   - Invalid model name (400 error)
   - Invalid API key (401 error)

## Key Findings

### 1. API Endpoint Compatibility

**Issue:** Initial tests failed with 404 errors because the SDK was using `/v1/responses` endpoint.

**Root Cause:** Vercel AI SDK's `@ai-sdk/openai` package defaults to Responses API when calling `openai(model)`:
- `openai()` → `/v1/responses` (Responses API)
- `openai.chat()` → `/v1/chat/completions` (Chat Completions API)

**Solution:** Always use `.chat()` method to explicitly use Chat Completions API, which is the standard OpenAI API endpoint.

**Code Change:**
```typescript
// Before (inconsistent)
const model = this.config.baseURL
  ? this.openAI.chat(this.config.model)
  : this.openAI(this.config.model);

// After (consistent)
const model = this.openAI.chat(this.config.model);
```

### 2. Error Handling

MiniMax's error responses are compatible with OpenAI format:

**Invalid Model:**
```json
{
  "type": "error",
  "error": {
    "type": "bad_request_error",
    "message": "invalid params, unknown model 'invalid-model-name' (2013)",
    "http_code": "400"
  }
}
```

**Invalid API Key:**
```json
{
  "type": "error",
  "error": {
    "type": "authorized_error",
    "message": "login fail: Please carry the API secret key in the 'Authorization' field of the request header (1004)",
    "http_code": "401"
  }
}
```

### 3. Response Format

MiniMax's response format is fully compatible with OpenAI's Chat Completions API:
- Streaming chunks use SSE format
- Tool calls follow OpenAI structure
- Usage stats are provided
- Done events are signaled correctly

## Known Limitations

Based on MiniMax documentation, the following OpenAI parameters are **ignored** (not errors):
- `presence_penalty`
- `frequency_penalty`
- `logit_bias`

MiniMax-specific behaviors:
- Temperature must be in range **(0.0, 1.0]** (exclusive of 0.0)
- With `reasoning_split=true`, reasoning content goes to `reasoning_details` field (not tested)
- `<think>` tags may appear in content by default (not observed in tests)

## Recommendations

1. **Use Chat Completions API consistently**: Always use `.chat()` method in `OpenAIProvider` to ensure compatibility with all OpenAI-compatible endpoints.

2. **Temperature validation**: Consider adding temperature validation to clamp values to minimum 0.01 for MiniMax compatibility.

3. **Documentation**: Update provider documentation to clarify that we use Chat Completions API, not Responses API.

4. **Testing**: Continue using MiniMax as a test target for OpenAI-compatible endpoint validation.

## Performance

Test execution time: **29.38 seconds** for 11 tests (including API calls)

This is reasonable for E2E tests with real API calls.

## Conclusion

MiniMax's OpenAI-compatible API is **fully compatible** with our SDK's `OpenAIProvider` implementation. The only required change was ensuring we consistently use the Chat Completions API endpoint (`.chat()` method) instead of the Responses API.

This validates:
- ✅ Our SDK can work with any OpenAI-compatible endpoint
- ✅ MiniMax's API follows OpenAI standards closely
- ✅ Error handling is robust across different providers
- ✅ Tool calling, streaming, and multi-turn conversations work correctly

## Next Steps

1. Consider adding MiniMax as an officially supported provider
2. Add temperature validation for MiniMax-specific constraints
3. Test MiniMax-specific features (reasoning_split, etc.)
4. Update documentation with MiniMax configuration examples
