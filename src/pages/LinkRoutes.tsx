import { lazy, Suspense } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CheckpointDetailSheet } from "../components/CheckpointDetailSheet";
import { UserProfileSheet } from "../components/UserProfileSheet";
import { PlaceDetailSheet } from "../components/PlaceDetailSheet";

// JourneyDetailSheet pulls in MapLibre — keep it lazy so deep links don't drag
// the map bundle into the main chunk.
const JourneyDetailSheet = lazy(() =>
  import("../components/JourneyDetailSheet").then((m) => ({ default: m.JourneyDetailSheet })),
);

/** Deep-link target for /c/:id — opens the checkpoint detail; closing lands on
 *  the Map. The shared URL survives login (react-router keeps it), so a recipient
 *  signs in and arrives straight here. */
export function CheckpointLink() {
  const { id } = useParams();
  const navigate = useNavigate();
  if (!id) return null;
  return <CheckpointDetailSheet id={id} onClose={() => navigate("/", { replace: true })} />;
}

/** Deep-link target for /p/:id — opens the place detail. */
export function PlaceLink() {
  const { id } = useParams();
  const navigate = useNavigate();
  if (!id) return null;
  return <PlaceDetailSheet id={id} onClose={() => navigate("/", { replace: true })} />;
}

/** Deep-link target for /u/:username — opens a user's public profile. Closing
 *  lands on the Map. Backs the profile share-card link. */
export function UserProfileLink() {
  const { username } = useParams();
  const navigate = useNavigate();
  if (!username) return <Navigate to="/" replace />;
  return <UserProfileSheet username={username} onClose={() => navigate("/", { replace: true })} />;
}

/** Deep-link target for /j/:id — opens the journey detail. */
export function JourneyLink() {
  const { id } = useParams();
  const navigate = useNavigate();
  if (!id) return null;
  return (
    <Suspense fallback={null}>
      <JourneyDetailSheet id={id} onClose={() => navigate("/", { replace: true })} />
    </Suspense>
  );
}
