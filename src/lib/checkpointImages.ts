const CHECKPOINT_IMAGES_BASE_URL =
  "https://media.checkpoint-app.space";

export function checkpointImageUrl(path: string): string {
  return `${CHECKPOINT_IMAGES_BASE_URL}/${path.replace(/^\/+/, "")}`;
}
