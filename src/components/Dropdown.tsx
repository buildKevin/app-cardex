import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutRectangle,
} from 'react-native';

import { colors, gutter, radii, shadow, spacing } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

export interface DropdownItem {
  label: string;
  selected: boolean;
  onSelect: () => void;
}

export interface DropdownSection {
  /** Overline above the group. Drop it when there is only one group. */
  title?: string;
  items: DropdownItem[];
}

interface DropdownProps {
  /** The current state, spelled out — this is the only place it is readable. */
  label: string;
  accessibilityLabel: string;
  sections: DropdownSection[];
}

/** Roughly one line of chips' worth of room below the trigger. */
const GAP = spacing.sm;

/**
 * A button that says what is currently being shown, and opens a menu to change
 * it.
 *
 * This replaced two rows of filter chips. Chips are the right control while
 * every option is worth one glance, and the wrong one past that: two rows of
 * five read as one control with five states, the second row moved whenever the
 * first one changed, and the list being filtered started below the fold. A
 * button collapses the whole state into one line of text that can be read
 * without decoding which pill is filled.
 *
 * The menu is a `Modal` rather than an absolutely-positioned overlay, for the
 * one reason that matters: it has to be dismissible by tapping anywhere else,
 * and the screen under it is a `ScrollView` whose content would otherwise
 * scroll the open menu off its own trigger.
 *
 * It knows nothing about what it is filtering. Items carry a label, whether they
 * are on, and what to do — no value type, so no cast at the call site and no
 * generic spanning two unrelated unions.
 */
export function Dropdown({ label, accessibilityLabel, sections }: DropdownProps) {
  const trigger = useRef<View>(null);
  const [anchor, setAnchor] = useState<LayoutRectangle | null>(null);
  const { width: screenWidth } = useWindowDimensions();

  const open = () => {
    // Measured on press rather than on layout: the trigger sits in a scroll
    // view, so where it was when it mounted is not where it is when tapped.
    trigger.current?.measureInWindow((x, y, width, height) =>
      setAnchor({ x, y, width, height }),
    );
  };

  return (
    <View ref={trigger} collapsable={false} style={styles.triggerWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: anchor !== null }}
        style={styles.trigger}
        onPress={open}
      >
        <Text variant="bodyMedium" numberOfLines={1}>
          {label}
        </Text>
        {/* The chevron glyph points right; a dropdown's points down. */}
        <View style={styles.chevron}>
          <Icon name="chevron" size={15} color={colors.textSecondary} />
        </View>
      </Pressable>

      <Modal
        visible={anchor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAnchor(null)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer le menu"
          style={styles.backdrop}
          onPress={() => setAnchor(null)}
        >
          {anchor ? (
            <View
              style={[
                styles.menu,
                {
                  top: anchor.y + anchor.height + GAP,
                  left: anchor.x,
                  minWidth: anchor.width,
                  // Never past the far gutter, whatever the longest label is.
                  maxWidth: screenWidth - anchor.x - gutter,
                },
              ]}
            >
              {sections.map((section, index) => (
                <View key={section.title ?? index} style={index > 0 && styles.divided}>
                  {section.title ? (
                    <Text variant="overline" tone="tertiary" uppercase style={styles.sectionTitle}>
                      {section.title}
                    </Text>
                  ) : null}

                  {section.items.map((item) => (
                    <Pressable
                      key={item.label}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected: item.selected }}
                      style={styles.item}
                      onPress={() => {
                        setAnchor(null);
                        item.onSelect();
                      }}
                    >
                      <Text
                        variant="body"
                        tone={item.selected ? 'primary' : 'secondary'}
                        numberOfLines={1}
                        style={styles.itemLabel}
                      >
                        {item.label}
                      </Text>
                      {/* Nothing in the gap when unselected: a dimmed tick on
                          every row makes all of them look half-chosen. */}
                      {item.selected ? <Icon name="check" size={16} /> : null}
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Shrink-wrapped, so the button is as wide as its label and not as wide as
  // the page.
  triggerWrap: {
    alignSelf: 'flex-start',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  chevron: {
    transform: [{ rotate: '90deg' }],
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  menu: {
    position: 'absolute',
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    ...shadow.raised,
  },
  divided: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xl,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
  },
  itemLabel: {
    flexShrink: 1,
  },
});
