const OPEN_CREATE_ON_LAUNCH_KEY = "cp.settings.openCreateOnLaunch";
const PREFER_CAMERA_ON_CHECKIN_KEY = "cp.settings.preferCameraOnCheckin";

function readBoolean(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage may be disabled; settings remain at their safe defaults.
  }
}

export const quickCheckinSettings = {
  get openCreateOnLaunch() {
    return readBoolean(OPEN_CREATE_ON_LAUNCH_KEY);
  },
  set openCreateOnLaunch(value: boolean) {
    writeBoolean(OPEN_CREATE_ON_LAUNCH_KEY, value);
  },
  get preferCameraOnCheckin() {
    return readBoolean(PREFER_CAMERA_ON_CHECKIN_KEY);
  },
  set preferCameraOnCheckin(value: boolean) {
    writeBoolean(PREFER_CAMERA_ON_CHECKIN_KEY, value);
  },
};
