import { createContext, useContext, useState, ReactNode } from "react";
import { UserProfileSheet } from "../components/UserProfileSheet";

interface UserProfileContextType {
  /** Open a user's public profile by id (preferred) or username (legacy). */
  showProfile: (userRef: string) => void;
}

const UserProfileContext = createContext<UserProfileContextType | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [profileUserRef, setProfileUserRef] = useState<string | null>(null);

  const showProfile = (userRef: string) => {
    setProfileUserRef(userRef);
  };

  return (
    <UserProfileContext.Provider value={{ showProfile }}>
      {children}
      {profileUserRef && (
        <UserProfileSheet
          userRef={profileUserRef}
          onClose={() => setProfileUserRef(null)}
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
