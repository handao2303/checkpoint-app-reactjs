const CHECKPOINT_IMAGES_BASE_URL =
  "https://zngdcfoeklogvjphhjkp.supabase.co/storage/v1/object/public/checkpoint-images";

export function checkpointImageUrl(path: string): string {
  return `${CHECKPOINT_IMAGES_BASE_URL}/${path.replace(/^\/+/, "")}`;
}
