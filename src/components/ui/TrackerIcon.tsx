import { createElement } from 'react';
import {
    Activity, Apple, Baby, Bandage, Bed, Bike, BookOpen, Brain, Briefcase, Car, ChartColumn,
    Cigarette, Coffee, Dog, Droplets, Dumbbell, Flame, FlaskConical, Flower, Flower2, Footprints, Gamepad2,
    GraduationCap, Guitar, Heart, HeartHandshake, HeartPulse, House, Laptop, Leaf, Moon, Mountain, Music,
    NotebookPen, Palette, Pill, Plane, Salad, Scale, Smartphone, Smile, Soup, Sun, Target, Thermometer,
    Timer, Users, Wallet, Wind, Wine, Zap, type LucideIcon,
} from 'lucide-react';

/** Tracker icons are stored as these keys. Older rows hold emojis; EMOJI_ALIASES maps them. */
export const TRACKER_ICONS: Record<string, LucideIcon> = {
    target: Target, dumbbell: Dumbbell, meditation: Flower2, moon: Moon, book: BookOpen, coffee: Coffee,
    phone: Smartphone, sun: Sun, smile: Smile, activity: Activity, users: Users, salad: Salad, zap: Zap,
    bandage: Bandage, study: GraduationCap, wallet: Wallet, water: Droplets, pill: Pill, guitar: Guitar,
    laptop: Laptop, home: House, brain: Brain, 'heart-pulse': HeartPulse, heart: Heart, flame: Flame,
    steps: Footprints, scale: Scale, flask: FlaskConical, chart: ChartColumn, wine: Wine, journal: NotebookPen,
    briefcase: Briefcase, palette: Palette, gut: Soup, stress: Wind, cycle: Flower, family: HeartHandshake,
    music: Music, bike: Bike, apple: Apple, smoking: Cigarette, baby: Baby, pet: Dog, leaf: Leaf, bed: Bed,
    game: Gamepad2, car: Car, travel: Plane, temperature: Thermometer, timer: Timer, mountain: Mountain,
};

export const DEFAULT_TRACKER_ICON = 'target';

const EMOJI_ALIASES: Record<string, string> = {
    '🎯': 'target', '💪': 'dumbbell', '🧘': 'meditation', '😴': 'moon', '🌙': 'moon', '📚': 'book', '☕': 'coffee',
    '📱': 'phone', '☀️': 'sun', '🌤️': 'smile', '😊': 'smile', '🏃': 'activity', '👟': 'steps', '🚶': 'steps',
    '👥': 'users', '🥗': 'salad', '⚡': 'zap', '🩹': 'bandage', '🧠': 'study', '💰': 'wallet', '💧': 'water',
    '💊': 'pill', '🎸': 'guitar', '💻': 'laptop', '🧹': 'home', '🏠': 'home', '❤️': 'heart', '💓': 'heart-pulse',
    '🔥': 'flame', '⚖️': 'scale', '🧪': 'flask', '📊': 'chart', '🍷': 'wine', '📓': 'journal', '💼': 'briefcase',
    '🎨': 'palette', '🫄': 'gut', '🤕': 'brain', '😮‍💨': 'stress', '🌸': 'cycle', '🌱': 'leaf',
};

export function resolveTrackerIcon(value?: string | null): LucideIcon {
    if (!value) return TRACKER_ICONS[DEFAULT_TRACKER_ICON];
    return TRACKER_ICONS[value] ?? TRACKER_ICONS[EMOJI_ALIASES[value] ?? ''] ?? TRACKER_ICONS[DEFAULT_TRACKER_ICON];
}

export function TrackerIcon({ value, className = 'h-4 w-4' }: { value?: string | null; className?: string }) {
    // createElement: the icon is a stable module-level component looked up by key, not created here.
    return createElement(resolveTrackerIcon(value), { className, 'aria-hidden': true, strokeWidth: 1.75 });
}
