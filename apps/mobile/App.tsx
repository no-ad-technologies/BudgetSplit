import { StatusBar } from "expo-status-bar";
import { GroupScreen } from "./src/screens/GroupScreen";

/**
 * Walking skeleton: one screen. Navigation (Expo Router) arrives with US-02, when there is more
 * than one group to navigate between.
 */
export default function App() {
  return (
    <>
      <GroupScreen />
      <StatusBar style="dark" />
    </>
  );
}
