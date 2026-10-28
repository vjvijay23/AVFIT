import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Colors } from '../../theme/colors';

interface DateOfBirthPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const today = new Date();
const minDate = new Date(today.getFullYear() - 100, today.getMonth(), today.getDate());
const maxDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());

function formatDate(value: string): string {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function asIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DateOfBirthPicker({ value, onChange }: DateOfBirthPickerProps) {
  const initialDate = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    return new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  }, [value]);
  const [visible, setVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const [showYearPicker, setShowYearPicker] = useState(false);

  const openPicker = () => {
    setCalendarMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    setShowYearPicker(false);
    setVisible(true);
  };

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const days = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  while (days.length % 7) days.push(null);

  const isDateAllowed = (date: Date) => date >= minDate && date <= maxDate;
  const changeMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    const earliestMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const latestMonth = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
    if (next >= earliestMonth && next <= latestMonth) setCalendarMonth(next);
  };

  const selectDay = (day: number) => {
    const selected = new Date(year, month, day);
    if (!isDateAllowed(selected)) return;
    onChange(asIsoDate(selected));
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={openPicker} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Choose date of birth">
        <Calendar size={18} color={Colors.textSecondary} />
        <Text style={[styles.fieldText, !value && styles.placeholder]}>{value ? formatDate(value) : 'Select your birth date'}</Text>
        <ChevronRight size={18} color={Colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.scrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalTop}>
              <View>
                <Text style={styles.modalEyebrow}>DATE OF BIRTH</Text>
                <Text style={styles.modalTitle}>{value ? formatDate(value) : 'Choose your birth date'}</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)} accessibilityLabel="Close date picker">
                <Text style={styles.closeText}>×</Text>
              </TouchableOpacity>
            </View>

            {showYearPicker ? (
              <>
                <TouchableOpacity style={styles.backToCalendar} onPress={() => setShowYearPicker(false)}>
                  <ChevronLeft size={16} color={Colors.primary} />
                  <Text style={styles.backToCalendarText}>Back to calendar</Text>
                </TouchableOpacity>
                <Text style={styles.yearPickerLabel}>Select year</Text>
                <ScrollView style={styles.yearList} contentContainerStyle={styles.yearGrid} showsVerticalScrollIndicator={false}>
                  {Array.from({ length: maxDate.getFullYear() - minDate.getFullYear() + 1 }, (_, index) => maxDate.getFullYear() - index).map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={[styles.yearOption, year === option && styles.yearOptionSelected]}
                      onPress={() => { setCalendarMonth(new Date(option, month, 1)); setShowYearPicker(false); }}
                    >
                      <Text style={[styles.yearOptionText, year === option && styles.yearOptionTextSelected]}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity style={styles.monthNav} onPress={() => changeMonth(-1)} accessibilityLabel="Previous month">
                    <ChevronLeft size={20} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.monthTitleButton} onPress={() => setShowYearPicker(true)}>
                    <Text style={styles.monthTitle}>{MONTHS[month]} {year}</Text>
                    <Text style={styles.yearHint}>Tap to choose year</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.monthNav} onPress={() => changeMonth(1)} accessibilityLabel="Next month">
                    <ChevronRight size={20} color={Colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.calendarGrid}>
                  {WEEKDAYS.map((label, index) => (
                    <View key={`${label}-${index}`} style={styles.dayCell}>
                      <Text style={styles.weekdayText}>{label}</Text>
                    </View>
                  ))}
                  {days.map((day, index) => {
                    if (!day) return <View key={`empty-${index}`} style={styles.dayCell} />;
                    const date = new Date(year, month, day);
                    const selected = value === asIsoDate(date);
                    const disabled = !isDateAllowed(date);
                    return (
                      <TouchableOpacity
                        key={asIsoDate(date)}
                        disabled={disabled}
                        style={[styles.dayCell, selected && styles.selectedDay, disabled && styles.disabledDay]}
                        onPress={() => selectDay(day)}
                      >
                        <Text style={[styles.dayText, selected && styles.selectedDayText, disabled && styles.disabledDayText]}>{day}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.ageHint}>You must be between 13 and 100 years old.</Text>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setVisible(false)}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#FAFAF8',
    paddingHorizontal: 14,
  },
  fieldText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  placeholder: { color: Colors.textSecondary },
  scrim: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(16, 28, 21, 0.42)', padding: 22 },
  modalCard: { width: '100%', maxWidth: 390, maxHeight: '88%', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 12 },
  modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, color: Colors.textSecondary, marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  closeButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24, lineHeight: 28, color: Colors.textSecondary },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthNav: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primarySoft },
  monthTitleButton: { alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8 },
  monthTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  yearHint: { fontSize: 10, color: Colors.textSecondary, marginTop: 2 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.borderSubtle, paddingTop: 6 },
  dayCell: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  weekdayText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '700' },
  dayText: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  selectedDay: { backgroundColor: Colors.primary },
  selectedDayText: { color: '#FFFFFF', fontWeight: '800' },
  disabledDay: { opacity: 0.35 },
  disabledDayText: { color: Colors.textSecondary },
  ageHint: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 12 },
  cancelButton: { minHeight: 44, marginTop: 12, borderRadius: 13, backgroundColor: Colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  cancelButtonText: { fontSize: 14, color: Colors.textPrimary, fontWeight: '700' },
  backToCalendar: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 4 },
  backToCalendarText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  yearPickerLabel: { fontSize: 14, color: Colors.textPrimary, fontWeight: '800', marginBottom: 10 },
  yearList: { maxHeight: 330 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yearOption: { width: '22%', minHeight: 40, borderRadius: 12, backgroundColor: Colors.surfaceWarm, alignItems: 'center', justifyContent: 'center' },
  yearOptionSelected: { backgroundColor: Colors.primary },
  yearOptionText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  yearOptionTextSelected: { color: '#FFFFFF' },
});
