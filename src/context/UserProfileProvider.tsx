import { createContext, useContext, useState, ReactNode } from "react";
import { UserProfileSheet } from "../components/UserProfileSheet";

interface UserProfileContextType {
  showProfile: (username: string) => void;
}

const UserProfileContext = createContext<UserProfileContextType | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profileUsername, setProfileUsername] = useState<string | null>(null);

  const showProfile = (username: string) => {
    setProfileUsername(username);
  };

  return (
    <UserProfileContext.Provider value={{ showProfile }}>
      {children}
      {profileUsername && (
        <UserProfileSheet
          username={profileUsername}
          onClose={() => setProfileUsername(null)}
        />
      )}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error("useUserProfile must be used within a UserProfileProvider");
  }
  return context;
}
