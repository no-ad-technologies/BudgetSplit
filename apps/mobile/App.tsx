import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GroupScreen } from "./src/screens/GroupScreen";
import { HomeScreen } from "./src/screens/HomeScreen";

export default function App() {
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);

  if (currentGroupId) {
    return (
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => setCurrentGroupId(null)}>
          <Text style={styles.backText}>← Back to groups</Text>
        </Pressable>
        <View style={styles.screen}>
          <GroupScreen groupId={currentGroupId} />
        </View>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <>
      <HomeScreen onOpenGroup={(groupId) => setCurrentGroupId(groupId)} />
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f5f8" },
  backButton: { paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8 },
  backText: { fontSize: 15, color: "#2f5bd3", fontWeight: "600" },
  screen: { flex: 1 },
});

