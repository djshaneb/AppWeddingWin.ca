function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("native chat photo sharing remains server-controlled and bounded", async () => {
  const app = await Deno.readTextFile(
    new URL("../../../app/(tabs)/index.tsx", import.meta.url),
  );
  const config = await Deno.readTextFile(
    new URL("../../../app.json", import.meta.url),
  );
  const sync = await Deno.readTextFile(
    new URL("../bd-chat-sync/index.ts", import.meta.url),
  );
  const status = await Deno.readTextFile(
    new URL("../bd-chat-status/index.ts", import.meta.url),
  );
  const shared = await Deno.readTextFile(
    new URL("./bd_chat.ts", import.meta.url),
  );
  const boundedReadMigration = await Deno.readTextFile(
    new URL("../../migrations/20260902063000_bound_chat_message_reads.sql", import.meta.url),
  );
  const unreadMigration = await Deno.readTextFile(
    new URL("../../migrations/20260902064500_exact_chat_unread_counts.sql", import.meta.url),
  );
  const deliveryBatchMigration = await Deno.readTextFile(
    new URL("../../migrations/20260902065000_fair_app_chat_delivery_batch.sql", import.meta.url),
  );

  assert(app.includes("expo-image-picker"), "the app must use the native photo picker");
  assert(app.includes("expo-image-manipulator"), "selected photos must be re-encoded before upload");
  assert(app.includes('testID="chat-image-button"'), "chat must expose an accessible photo action");
  assert(
    app.includes("setNativeChatImagesEnabled(data.chat_images_enabled)") &&
      !app.includes("const imagesEnabled = false"),
    "the backend response, not a hardcoded client value, must control photo sharing",
  );
  assert(
    app.includes("ImageManipulator.SaveFormat.JPEG") &&
      app.includes("CHAT_IMAGE_PREPARE_OPTIONS") &&
      app.includes("CHAT_IMAGE_MAX_DATA_URI_LENGTH = 320_000") &&
      app.includes("image_data_uri"),
    "the app must resize, re-encode, and bound the selected photo before sending",
  );
  assert(
    !app.includes("requestMediaLibraryPermissionsAsync") &&
      app.includes("system PHPicker") &&
      /editable=\{\s*!sending\s*&&\s*!reporting\s*\}/.test(app),
    "the picker must use selected-item access and the draft must be locked while an upload is active",
  );
  assert(
    config.includes("NSPhotoLibraryUsageDescription") &&
      config.includes("expo-image-picker"),
    "the canonical Expo config must declare user-initiated photo-library access",
  );
  assert(
    shared.includes('Deno.env.get("CHAT_IMAGES_ENABLED")') &&
      shared.includes('Deno.env.get("CHAT_IMAGES_ENABLED_SINCE")') &&
      shared.includes('deliveryPolicy === "pause"') &&
      shared.includes("pausedImageDelivery = true") &&
      shared.includes("independent text messages") &&
      shared.includes('admin.rpc("app_chat_delivery_batch"') &&
      shared.includes("hasMoreMessages") &&
      deliveryBatchMigration.includes("jsonb_array_length(m.image_urls) = 0") &&
      deliveryBatchMigration.includes("p_images_enabled_since") &&
      deliveryBatchMigration.includes("service_role"),
    "the backend must retain an explicit enable flag and rollout cutoff",
  );
  assert(
    sync.includes("await validateDecodedChatImageDataUri(imageDataUri)") &&
      sync.includes("safeChatImageUrls") &&
      sync.includes("messages: messageDtos.slice(-12)") &&
      sync.includes("new ChatPolicyError(") &&
      sync.includes("400,"),
    "the backend must decode uploads, return bounded media, and classify validation failures as client errors",
  );
  assert(
    shared.includes('admin.rpc("chat_recent_messages"') &&
      shared.includes('limit: 25') &&
      shared.includes('key !== "message_content"') &&
      shared.includes("mirrorUnreadOwnerCountsForThreads") &&
      shared.includes("appUnreadCountsForThreads") &&
      shared.includes("image_data_uri: null") &&
      boundedReadMigration.includes("partition by m.thread_token") &&
      boundedReadMigration.includes("service_role") &&
      unreadMigration.includes("chat_unread_owner_counts") &&
      unreadMigration.includes("app_chat_unread_counts") &&
      sync.includes("unreadOwnersByThread") &&
      status.includes("unreadOwnersByThread"),
    "mirror reads and unread counts must be bounded, content-free, and fair per thread",
  );
});
