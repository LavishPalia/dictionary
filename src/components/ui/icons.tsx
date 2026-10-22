// Line icons from the redesign mockups. Decorative: the control that holds one must carry the label.
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>
);

export const SearchIcon = () => <Svg><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Svg>;
export const MoreIcon = () => <Svg><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></Svg>;
export const BookIcon = () => <Svg><path d="M3 5.5C6 4 9 4 12 6c3-2 6-2 9-.5V19c-3-1.5-6-1.5-9 .5-3-2-6-2-9-.5z" /><path d="M12 6v13.5" /></Svg>;
export const StarIcon = () => <Svg><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></Svg>;
export const ChevronIcon = () => <Svg><path d="M9 6l6 6-6 6" /></Svg>;
