import { forwardRef, type ComponentType } from 'react';
import {
  AlertCircle, Archive as ArchiveIcon, ArrowDownRight, ArrowRight as ArrowRightIcon,
  BarChart3, BookOpen as BookOpenIcon, Bug as BugIcon, CalendarDays, CalendarPlus as CalendarPlusIcon,
  Check as CheckIcon, ChevronLeft, ChevronRight, CircleCheck, CircleDollarSign, Clock as ClockIcon,
  Command as CommandIcon, Copy as CopyIcon, CornerDownRight, Database as DatabaseIcon,
  Download, Dumbbell, Flag as FlagIcon, Flame, FolderOpen as FolderOpenIcon, GitBranch as GitBranchIcon,
  Grid2X2, Layers, Lightbulb as LightbulbIcon, Link as LinkIcon, ListPlus as ListPlusIcon,
  MessageSquareText, Moon as MoonIcon, MoreHorizontal, Notebook as NotebookIcon, NotebookPen,
  Package as PackageIcon, PanelLeftClose, Pencil, PhoneCall as PhoneCallIcon, Play as PlayIcon,
  Plus as PlusIcon, Power as PowerIcon, Quote, RefreshCw, RotateCcw, Save, Search, ShieldCheck as ShieldCheckIcon,
  Ship, Soup, SquareArrowOutUpRight, Sun as SunIcon, Target as TargetIcon, Timer as TimerIcon, LoaderCircle,
  Trash2, TrendingUp, Users as UsersIcon, UtensilsCrossed, Wrench as WrenchIcon, X as XIcon,
} from 'lucide-react';

type LooseIcon = ComponentType<any>;
const adapt = (Icon: LooseIcon) => forwardRef<SVGSVGElement, any>(function BarryIcon({ weight: _weight, ...props }, ref) {
  return <Icon ref={ref} {...props} />;
});

export const WarningCircle = adapt(AlertCircle);
export const Archive = adapt(ArchiveIcon);
export const ArrowBendDownRight = adapt(CornerDownRight);
export const ArrowRight = adapt(ArrowRightIcon);
export const ArrowSquareOut = adapt(SquareArrowOutUpRight);
export const Barbell = adapt(Dumbbell);
export const BookOpen = adapt(BookOpenIcon);
export const BowlFood = adapt(Soup);
export const Bug = adapt(BugIcon);
export const CalendarBlank = adapt(CalendarDays);
export const CalendarPlus = adapt(CalendarPlusIcon);
export const CaretLeft = adapt(ChevronLeft);
export const CaretRight = adapt(ChevronRight);
export const ChartLine = adapt(BarChart3);
export const ChartLineUp = adapt(BarChart3);
export const Check = adapt(CheckIcon);
export const CheckCircle = adapt(CircleCheck);
export const ChatCenteredText = adapt(MessageSquareText);
export const Clock = adapt(ClockIcon);
export const Command = adapt(CommandIcon);
export const Copy = adapt(CopyIcon);
export const CurrencyCircleDollar = adapt(CircleDollarSign);
export const Database = adapt(DatabaseIcon);
export const DotsThree = adapt(MoreHorizontal);
export const DownloadSimple = adapt(Download);
export const Fire = adapt(Flame);
export const FloppyDisk = adapt(Save);
export const FolderOpen = adapt(FolderOpenIcon);
export const ForkKnife = adapt(UtensilsCrossed);
export const GitBranch = adapt(GitBranchIcon);
export const Flag = adapt(FlagIcon);
export const Lightbulb = adapt(LightbulbIcon);
export const LinkSimple = adapt(LinkIcon);
export const ListPlus = adapt(ListPlusIcon);
export const MagnifyingGlass = adapt(Search);
export const Moon = adapt(MoonIcon);
export const Notebook = adapt(NotebookIcon);
export const NotePencil = adapt(NotebookPen);
export const Package = adapt(PackageIcon);
export const PencilSimple = adapt(Pencil);
export const PhoneCall = adapt(PhoneCallIcon);
export const Play = adapt(PlayIcon);
export const Plus = adapt(PlusIcon);
export const Power = adapt(PowerIcon);
export const Quotes = adapt(Quote);
export const ArrowsClockwise = adapt(RefreshCw);
export const ArrowCounterClockwise = adapt(RotateCcw);
export const ShieldCheck = adapt(ShieldCheckIcon);
export const SidebarSimple = adapt(PanelLeftClose);
export const SquaresFour = adapt(Grid2X2);
export const Stack = adapt(Layers);
export const SpinnerGap = adapt(LoaderCircle);
export const Sun = adapt(SunIcon);
export const Target = adapt(TargetIcon);
export const Timer = adapt(TimerIcon);
export const Trash = adapt(Trash2);
export const TrendUp = adapt(TrendingUp);
export const Users = adapt(UsersIcon);
export const Wrench = adapt(WrenchIcon);
export const X = adapt(XIcon);
export const ShipIcon = adapt(Ship);
export const ArrowDiagonal = adapt(ArrowDownRight);
