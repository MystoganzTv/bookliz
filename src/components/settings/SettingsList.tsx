/**
 * Grouped settings list — the iOS "inset grouped" pattern (the one BookPlayer
 * and the system Settings app use).
 *
 * A group is a short header, a rounded block of one-line rows, and an optional
 * footer. The explanation of a setting lives in the footer, not in a paragraph
 * on every row: the row says WHAT it is and its current value, the footer says
 * WHY you would change it. Rows that lead somewhere show their value and a
 * chevron; rows that are a yes/no carry a Switch.
 */
import { Ionicons } from "@expo/vector-icons";
import { Children, Fragment, isValidElement, PropsWithChildren, ReactNode, useMemo } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useColors } from "../../theme/ThemeContext";
import { AppColors, fonts, radii, spacing } from "../../theme/theme";

type GroupProps = PropsWithChildren<{
  header?: string;
  footer?: ReactNode;
}>;

export function SettingsGroup({ header, footer, children }: GroupProps) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  // Hairlines go BETWEEN rows, so the group draws them rather than each row
  // guessing whether it is the last one. `null` children (conditional rows) are skipped.
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.group}>
      {header ? <Text style={styles.header} accessibilityRole="header">{header}</Text> : null}
      {/* No rows (an empty "Not assigned"): header and footer only — an empty block reads as a broken line. */}
      {rows.length > 0 ? (
        <View style={styles.block}>
          {rows.map((row, index) => (
            <Fragment key={row.key ?? index}>
              {index > 0 ? <View style={styles.separator} /> : null}
              {row}
            </Fragment>
          ))}
        </View>
      ) : null}
      {footer ? (
        typeof footer === "string" ? <Text style={styles.footer}>{footer}</Text> : <View style={styles.footerWrap}>{footer}</View>
      ) : null}
    </View>
  );
}

type RowProps = {
  title: string;
  /** Second line under the title — use sparingly; most explanations belong in the group footer. */
  subtitle?: string;
  /** Current value, shown muted on the right (e.g. "System"). */
  value?: string;
  onPress?: () => void;
  /** Shows the chevron. Defaults to true when the row is pressable and has no accessory. */
  chevron?: boolean;
  destructive?: boolean;
  /** A checkmark on the right — for rows inside a choice list. */
  checked?: boolean;
  accessory?: ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function SettingsRow({
  title,
  subtitle,
  value,
  onPress,
  chevron,
  destructive,
  checked,
  accessory,
  disabled,
  accessibilityLabel,
}: RowProps) {
  const c = useColors();
  const styles = useMemo(() => createStyles(c), [c]);
  const showChevron = chevron ?? (!!onPress && !accessory && checked === undefined);
  const body = (
    <>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, destructive && styles.rowTitleDanger, disabled && styles.rowDisabled]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={3}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
      {accessory}
      {checked ? <Ionicons name="checkmark" size={20} color={c.tealDark} /> : null}
      {showChevron ? <Ionicons name="chevron-forward" size={17} color={c.muted} /> : null}
    </>
  );
  if (!onPress) {
    return <View style={styles.row} accessibilityLabel={accessibilityLabel}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)}
      accessibilityState={{ disabled, selected: checked }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {body}
    </Pressable>
  );
}

type ToggleProps = {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

export function SettingsToggleRow({ title, subtitle, value, onValueChange, disabled }: ToggleProps) {
  const c = useColors();
  return (
    <SettingsRow
      title={title}
      subtitle={subtitle}
      disabled={disabled}
      accessory={
        <Switch
          accessibilityLabel={title}
          disabled={disabled}
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: c.border, true: c.teal }}
          ios_backgroundColor={c.border}
        />
      }
    />
  );
}

export type SettingsChoice<T extends string | number> = { value: T; label: string; subtitle?: string };

/** A group whose rows are mutually exclusive options, the chosen one checked. */
export function SettingsChoiceGroup<T extends string | number>({
  header,
  footer,
  options,
  selected,
  onSelect,
}: {
  header?: string;
  footer?: ReactNode;
  options: ReadonlyArray<SettingsChoice<T>>;
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <SettingsGroup header={header} footer={footer}>
      {options.map((option) => (
        <SettingsRow
          key={String(option.value)}
          title={option.label}
          subtitle={option.subtitle}
          checked={option.value === selected}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </SettingsGroup>
  );
}

function createStyles(c: AppColors) {
  return StyleSheet.create({
    group: {
      marginBottom: spacing.lg,
    },
    header: {
      color: c.muted,
      fontFamily: fonts.body,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 7,
      paddingHorizontal: spacing.md,
    },
    block: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderRadius: radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: "hidden",
    },
    separator: {
      backgroundColor: c.border,
      height: StyleSheet.hairlineWidth,
      marginLeft: spacing.md,
    },
    footer: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12.5,
      lineHeight: 18,
      marginTop: 7,
      paddingHorizontal: spacing.md,
    },
    footerWrap: {
      marginTop: 7,
      paddingHorizontal: spacing.md,
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: 50,
      paddingHorizontal: spacing.md,
      paddingVertical: 11,
    },
    rowPressed: {
      backgroundColor: c.surfaceAlt,
    },
    rowCopy: {
      flex: 1,
    },
    rowTitle: {
      color: c.ink,
      fontFamily: fonts.body,
      fontSize: 16,
    },
    rowTitleDanger: {
      color: c.danger,
    },
    rowDisabled: {
      opacity: 0.45,
    },
    rowSubtitle: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 12.5,
      lineHeight: 17,
      marginTop: 2,
    },
    rowValue: {
      color: c.muted,
      fontFamily: fonts.bodyRegular,
      fontSize: 15,
      maxWidth: "55%",
      textAlign: "right",
    },
  });
}
