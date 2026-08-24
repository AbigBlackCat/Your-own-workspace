import { CalendarBlank, CaretLeft, CaretRight } from "../icons";
import type { ReactNode } from "react";
import { classNames, localDate } from "../workspace-utils";
import { IconButton } from "./workspace-ui";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

export function MonthCalendar({ month, selectedDate, onMonthChange, onSelectDate, renderDay }: {
  month: string;
  selectedDate?: string;
  onMonthChange: (month: string) => void;
  onSelectDate: (date: string) => void;
  renderDay: (date: string) => ReactNode;
}) {
  const days = buildMonthDays(month);
  const today = localDate();
  return (
    <div className="month-calendar">
      <header className="month-calendar-toolbar">
        <div><CalendarBlank size={18} /><strong>{formatMonth(month)}</strong></div>
        <div><IconButton label="上个月" onClick={() => onMonthChange(shiftMonth(month, -1))}><CaretLeft size={17} /></IconButton><button className="calendar-today" onClick={() => { onMonthChange(today.slice(0, 7)); onSelectDate(today); }}>回到今天</button><IconButton label="下个月" onClick={() => onMonthChange(shiftMonth(month, 1))}><CaretRight size={17} /></IconButton></div>
      </header>
      <div className="month-calendar-scroll">
        <div className="month-calendar-weekdays">{weekdays.map((weekday) => <span key={weekday}>周{weekday}</span>)}</div>
        <div className="month-calendar-grid">{days.map((day) => <button type="button" key={day.date} data-date={day.date} className={classNames("month-calendar-day", !day.inMonth && "outside", day.date === today && "today", day.date === selectedDate && "selected")} onClick={() => onSelectDate(day.date)}><span className="calendar-day-number">{Number(day.date.slice(-2))}</span><div className="calendar-day-content">{renderDay(day.date)}</div></button>)}</div>
      </div>
    </div>
  );
}

export function buildMonthDays(month: string): Array<{ date: string; inMonth: boolean }> {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthNumber - 1, 1 - mondayOffset, 12);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const value = toLocalDate(date);
    return { date: value, inMonth: value.slice(0, 7) === month };
  });
}

export function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + amount, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(new Date(year, monthNumber - 1, 1));
}
