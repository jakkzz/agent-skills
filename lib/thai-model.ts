import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export async function completeThaiModel(
  ctx: ExtensionContext,
  message: UserMessage,
  signal?: AbortSignal,
): Promise<AssistantMessage> {
  if (!ctx.model) throw new Error("No model selected");
  const provider = ctx.modelRegistry.getProvider(ctx.model.provider);
  if (!provider) throw new Error(`Unknown provider: ${ctx.model.provider}`);
  const providerAuth = await ctx.modelRegistry.getProviderAuth(ctx.model.provider);
  if (!providerAuth) throw new Error(`Provider is not configured: ${ctx.model.provider}`);
  const requestAuth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!requestAuth.ok) {
    throw new Error("error" in requestAuth ? String(requestAuth.error) : `Unable to authenticate ${ctx.model.provider}`);
  }
  const model = providerAuth.auth.baseUrl
    ? { ...ctx.model, baseUrl: providerAuth.auth.baseUrl }
    : ctx.model;
  return provider.streamSimple(
    model,
    { messages: [message] },
    {
      apiKey: requestAuth.apiKey ?? providerAuth.auth.apiKey,
      headers: requestAuth.headers ?? providerAuth.auth.headers,
      env: requestAuth.env ?? providerAuth.env,
      signal,
    },
  ).result();
}

export function thaiResponseText(response: AssistantMessage): string | null {
  if (response.stopReason === "aborted") return null;
  if (response.stopReason === "error") throw new Error(response.errorMessage || "The model request failed");
  if (response.stopReason === "length") throw new Error("The model response was truncated; try a shorter passage");
  if (response.stopReason === "toolUse") throw new Error("The model returned an unexpected tool call");
  return response.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
