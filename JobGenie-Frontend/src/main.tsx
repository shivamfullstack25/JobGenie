import {createRoot} from "react-dom/client";
import App from "./App";
import "./index.css";
import { auth } from "./firebase";
import { installAuthFetch } from "./lib/authFetch";
import { API_BASE_URL } from "./lib/queryClient";

// Must run before anything renders: every backend call needs the signed-in user's ID token.
// authStateReady() waits for Firebase to restore a persisted session, so requests fired on first
// paint don't go out unauthenticated just because they raced the SDK's startup.
installAuthFetch(async () => {
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}, API_BASE_URL);

createRoot(document.getElementById("root")!).render(<App />);
