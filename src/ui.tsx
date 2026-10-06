import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, s } from "./styles";
export type IconName = React.ComponentProps<typeof Feather>["name"];
export function Icon({
  name,
  color = C.muted,
  size: sz = 19,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return <Feather name={name} color={color} size={sz} />;
}
export function Button({
  title,
  icon,
  onPress,
  primary = false,
  disabled = false,
  small = false,
}: {
  title: string;
  icon?: IconName;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        primary && s.primary,
        small && { paddingVertical: 9, paddingHorizontal: 12 },
        (pressed || disabled) && { opacity: 0.55 },
      ]}
    >
      {icon && <Icon name={icon} color={primary ? C.white : C.ink} size={17} />}
      <Text style={[s.buttonText, primary && { color: C.white }]}>{title}</Text>
    </Pressable>
  );
}
export function IconButton({
  icon,
  label,
  onPress,
  color = C.muted,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={s.iconButton}
    >
      <Icon name={icon} color={color} />
    </Pressable>
  );
}
export function Input({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label?: string }) {
  return (
    <View style={{ gap: 7 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#99A3B0"
        {...props}
        style={[s.input, props.style]}
      />
    </View>
  );
}
export const emailOf = (v: string) => v.match(/<([^>]+)>/)?.[1] || v;
export const nameOf = (v: string) =>
  v.includes("<") ? v.split("<")[0].replace(/"/g, "").trim() : v.split("@")[0];
export const recipientList = (v: string) =>
  v
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
export const date = (v: string) =>
  new Date(v).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
export const size = (n = 0) =>
  n >= 1048576
    ? `${(n / 1048576).toFixed(1)} Mo`
    : `${Math.max(1, Math.round(n / 1024))} Ko`;
