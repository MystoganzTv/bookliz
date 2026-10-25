import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback } from "react";
import { RootStackParamList } from "../navigation/types";
import { ProFeature, usePro } from "./ProContext";

/**
 * `gate("cloudAudio")` → true when the reader has Pro; otherwise opens the
 * paywall on that feature and returns false, so call sites read as
 * `if (!gate("x")) return;`.
 */
export function useProGate() {
  const { isPro } = usePro();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return useCallback(
    (feature: ProFeature) => {
      if (isPro) return true;
      navigation.navigate("Paywall", { feature });
      return false;
    },
    [isPro, navigation],
  );
}
