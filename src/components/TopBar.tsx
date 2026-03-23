import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  title: string;
  showBack?: boolean;
  backTo?: string;
  trailing?: React.ReactNode;
}

export default function TopBar({ title, showBack = false, backTo, trailing }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="flex items-center h-14 px-4 max-w-2xl mx-auto">
        {showBack && (
          <button
            onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
            className="mr-3 p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Go back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <h1 className="text-lg font-medium text-gray-900 truncate flex-1">{title}</h1>
        {trailing && <div className="ml-3">{trailing}</div>}
      </div>
    </header>
  );
}
