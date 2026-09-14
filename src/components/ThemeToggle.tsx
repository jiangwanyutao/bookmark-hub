import { Moon, Sun } from 'lucide-react';
import { toggleTheme, useTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const theme = useTheme();
  const label = theme === 'dark' ? '切换到浅色' : '切换到深色';
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={toggleTheme}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}
