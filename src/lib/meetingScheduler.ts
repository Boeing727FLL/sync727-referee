export interface SpecialEvent {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'event' | 'cancelled';
  description: string;
}

export interface MeetingSchedule {
  meetingDays: number[]; // 0=Sunday, 1=Monday...
  specialEvents: SpecialEvent[];
}

export function computeNextMeeting(schedule: MeetingSchedule | undefined): { date: string; description: string | null; isCancelled: boolean } | null {
  if (!schedule) return null;

  const israelDateStr = getTodayDateStr();
  const [y, m, day] = israelDateStr.split('-').map(Number);
  
  // Look forward up to 90 days to find the next meeting starting from today in Israel
  for (let i = 0; i < 90; i++) {
    const d = new Date(Date.UTC(y, m-1, day + i, 12, 0, 0));
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getUTCDay();

    const specialEvent = schedule.specialEvents?.find(e => e.date === dateStr);
    const isNormallyScheduled = schedule.meetingDays?.includes(dayOfWeek);
    
    if (specialEvent) {
      if (specialEvent.type === 'cancelled') {
        if (isNormallyScheduled) {
          return { date: dateStr, description: specialEvent.description, isCancelled: true };
        }
        // If it's cancelled but not normally scheduled, just keep looking
      } else if (specialEvent.type === 'event') {
        return { date: dateStr, description: specialEvent.description, isCancelled: false };
      }
    } else {
      if (isNormallyScheduled) {
        return { date: dateStr, description: null, isCancelled: false };
      }
    }
  }

  return null;
}

export function getTodayDateStr(): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export interface MeetingInfo {
  isMeeting: boolean;
  isCancelled: boolean;
  description: string | null;
}

export function getMeetingForDate(schedule: MeetingSchedule | undefined, dateStr: string): MeetingInfo {
  if (!schedule) return { isMeeting: false, isCancelled: false, description: null };

  // Parse YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length !== 3) return { isMeeting: false, isCancelled: false, description: null };
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1;
  const day = parseInt(parts[2]);
  
  // Use UTC noon to get the day of week for the date string reliably without local timezone interference
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dayOfWeek = d.getUTCDay();

  const specialEvent = schedule.specialEvents?.find(e => e.date === dateStr);
  const isNormallyScheduled = schedule.meetingDays?.includes(dayOfWeek);

  if (specialEvent) {
    if (specialEvent.type === 'cancelled') {
      return { isMeeting: isNormallyScheduled || false, isCancelled: true, description: specialEvent.description };
    } else {
      return { isMeeting: true, isCancelled: false, description: specialEvent.description };
    }
  }

  if (isNormallyScheduled) {
    return { isMeeting: true, isCancelled: false, description: null };
  }

  return { isMeeting: false, isCancelled: false, description: null };
}

export function isTodayAMeetingDay(schedule: MeetingSchedule | undefined): boolean {
  const todayStr = getTodayDateStr();
  const info = getMeetingForDate(schedule, todayStr);
  return info.isMeeting && !info.isCancelled;
}
