/**
 * AirPlay button. Renders nothing where the native view is not in the build
 * (Expo Go, web, an older binary) — a missing button beats a red screen.
 */
import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ComponentType } from "react";
import { Platform, type ViewProps } from "react-native";

export type AirPlayButtonProps = ViewProps & {
  /** Icon colour while sound plays on the phone. */
  tintColor?: string;
  /** Icon colour while sound goes to another device. */
  activeTintColor?: string;
};

const available = Platform.OS === "ios" && requireOptionalNativeModule("AirPlayButton") !== null;

const NativeAirPlayButton: ComponentType<AirPlayButtonProps> | null = available
  ? requireNativeView<AirPlayButtonProps>("AirPlayButton")
  : null;

export const isAirPlayAvailable = available;

export function AirPlayButton(props: AirPlayButtonProps) {
  return NativeAirPlayButton ? <NativeAirPlayButton {...props} /> : null;
}
