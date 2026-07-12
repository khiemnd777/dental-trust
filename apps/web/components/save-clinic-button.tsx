'use client';

import { useEffect, useState } from 'react';
import { Button, Icon } from '@dental-trust/ui';

export function SaveClinicButton({
  slug,
  save,
  saved,
}: {
  slug: string;
  save: string;
  saved: string;
}) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    try {
      setActive(
        (JSON.parse(localStorage.getItem('dt-saved-clinics') ?? '[]') as string[]).includes(slug),
      );
    } catch {
      setActive(false);
    }
  }, [slug]);
  const toggle = () => {
    let values: string[];
    try {
      values = JSON.parse(localStorage.getItem('dt-saved-clinics') ?? '[]') as string[];
    } catch {
      values = [];
    }
    const next = values.includes(slug) ? values.filter((item) => item !== slug) : [...values, slug];
    localStorage.setItem('dt-saved-clinics', JSON.stringify(next));
    setActive(next.includes(slug));
  };
  return (
    <Button aria-pressed={active} variant="secondary" onClick={toggle}>
      <Icon name="heart" style={active ? { fill: 'currentColor' } : undefined} />
      {active ? saved : save}
    </Button>
  );
}
