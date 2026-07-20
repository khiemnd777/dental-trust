'use client';

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

type DropdownAlignment = 'start' | 'end';
type DropdownVariant = 'field' | 'compact' | 'pill';

interface ParsedOption {
  readonly disabled: boolean;
  readonly label: ReactNode;
  readonly value: string;
}

interface DropdownPosition {
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export interface CustomSelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children' | 'className' | 'multiple' | 'size'
> {
  readonly align?: DropdownAlignment | undefined;
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly menuLabel?: string | undefined;
  readonly variant?: DropdownVariant | undefined;
}

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

function textValue(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textValue).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textValue(node.props.children);
  return '';
}

function collectOptions(children: ReactNode): ParsedOption[] {
  const options: ParsedOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment || child.type === 'optgroup') {
      collectOptions((child.props as { children?: ReactNode }).children).forEach((option) =>
        options.push(option),
      );
      return;
    }
    if (child.type !== 'option') return;
    const element = child as ReactElement<OptionHTMLAttributes<HTMLOptionElement>>;
    options.push({
      disabled: Boolean(element.props.disabled),
      label: element.props.children,
      value: String(element.props.value ?? textValue(element.props.children)),
    });
  });
  return options;
}

function normalizeValue(value: SelectHTMLAttributes<HTMLSelectElement>['value']): string {
  if (Array.isArray(value)) return String(value[0] ?? '');
  return value === undefined || value === null ? '' : String(value);
}

function firstValue(
  options: readonly ParsedOption[],
  preferred: SelectHTMLAttributes<HTMLSelectElement>['defaultValue'],
) {
  const normalized = normalizeValue(preferred);
  if (preferred !== undefined && options.some((option) => option.value === normalized)) {
    return normalized;
  }
  return options[0]?.value ?? '';
}

export function CustomSelect({
  align = 'start',
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  autoFocus,
  children,
  className,
  defaultValue,
  disabled = false,
  id,
  menuLabel,
  onChange,
  onInvalid,
  required,
  value,
  variant = 'field',
  ...selectProps
}: CustomSelectProps) {
  const generatedId = useId();
  const controlId = id ?? `custom-select-${generatedId}`;
  const listboxId = `${controlId}-listbox`;
  const options = useMemo(() => collectOptions(children), [children]);
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(() =>
    firstValue(options, defaultValue),
  );
  const currentValue = controlled ? normalizeValue(value) : uncontrolledValue;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === currentValue),
  );
  const selectedOption = options[selectedIndex];
  const unavailable = disabled || options.length === 0;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [invalid, setInvalid] = useState(false);
  const [position, setPosition] = useState<DropdownPosition>({ left: 0, top: 0, width: 228 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (controlled || options.some((option) => option.value === uncontrolledValue)) return;
    setUncontrolledValue(firstValue(options, defaultValue));
  }, [controlled, defaultValue, options, uncontrolledValue]);

  useEffect(() => {
    if (!autoFocus) return;
    triggerRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const form = nativeRef.current?.form;
    if (!form || controlled) return;
    const reset = () => setUncontrolledValue(firstValue(options, defaultValue));
    form.addEventListener('reset', reset);
    return () => form.removeEventListener('reset', reset);
  }, [controlled, defaultValue, options]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gutter = 12;
    const gap = 8;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const width = Math.min(Math.max(rect.width, 228), viewportWidth - gutter * 2);
    const desiredLeft = align === 'end' ? rect.right - width : rect.left;
    const left = Math.min(Math.max(desiredLeft, gutter), viewportWidth - width - gutter);
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const below = rect.bottom + gap;
    const above = rect.top - gap - menuHeight;
    const top =
      menuHeight > 0 && below + menuHeight > viewportHeight - gutter && above >= gutter
        ? above
        : Math.min(below, Math.max(gutter, viewportHeight - menuHeight - gutter));
    setPosition({ left, top, width });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  function moveActive(direction: 1 | -1) {
    const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]));
    if (!enabled.length) return;
    const current = enabled.indexOf(activeIndex);
    const next =
      direction === 1
        ? (current + 1) % enabled.length
        : (current - 1 + enabled.length) % enabled.length;
    const target = enabled[next];
    if (target !== undefined) setActiveIndex(target);
  }

  function openMenu() {
    if (unavailable) return;
    setActiveIndex(selectedIndex);
    setOpen(true);
  }

  function emitChange(nextValue: string) {
    const select = nativeRef.current;
    if (!select) return;
    select.value = nextValue;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function chooseOption(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    emitChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleNativeChange(event: ChangeEvent<HTMLSelectElement>) {
    if (!controlled) setUncontrolledValue(event.currentTarget.value);
    setInvalid(false);
    onChange?.(event);
  }

  const menu = open ? (
    <div
      className="dt-custom-select__menu"
      ref={menuRef}
      style={
        {
          '--dt-select-menu-left': `${position.left}px`,
          '--dt-select-menu-top': `${position.top}px`,
          '--dt-select-menu-width': `${position.width}px`,
        } as CSSProperties
      }
    >
      {menuLabel ? <p className="dt-custom-select__menu-label">{menuLabel}</p> : null}
      <div
        aria-label={menuLabel ?? ariaLabel ?? 'Lựa chọn'}
        className="dt-custom-select__options"
        id={listboxId}
        role="listbox"
      >
        {options.map((option, index) => (
          <div
            aria-disabled={option.disabled || undefined}
            aria-selected={option.value === currentValue}
            className={classNames(
              'dt-custom-select__option',
              index === activeIndex && 'is-active',
              option.value === currentValue && 'is-selected',
            )}
            data-option-index={index}
            data-option-value={option.value}
            id={`${listboxId}-option-${index}`}
            key={`${option.value}-${index}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              chooseOption(index);
            }}
            onMouseEnter={() => {
              if (!option.disabled) setActiveIndex(index);
            }}
            onMouseDown={(event) => event.preventDefault()}
            role="option"
          >
            <span>{option.label}</span>
            {option.value === currentValue ? (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="m5 12 4 4L19 6" />
              </svg>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div
      className={classNames(
        'dt-custom-select',
        `dt-custom-select--${variant}`,
        open && 'is-open',
        invalid && 'is-invalid',
        className,
      )}
      ref={rootRef}
    >
      <button
        aria-activedescendant={open ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-controls={open ? listboxId : undefined}
        aria-describedby={ariaDescribedBy}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-invalid={invalid || ariaInvalid}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-required={required || undefined}
        className="dt-custom-select__trigger"
        disabled={unavailable}
        id={controlId}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key === 'Tab') {
            setOpen(false);
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) {
              openMenu();
              return;
            }
            moveActive(event.key === 'ArrowDown' ? 1 : -1);
            return;
          }
          if (event.key === 'Home' && open) {
            event.preventDefault();
            const first = options.findIndex((option) => !option.disabled);
            if (first >= 0) setActiveIndex(first);
            return;
          }
          if (event.key === 'End' && open) {
            event.preventDefault();
            let last = -1;
            for (let index = options.length - 1; index >= 0; index -= 1) {
              if (!options[index]?.disabled) {
                last = index;
                break;
              }
            }
            if (last >= 0) setActiveIndex(last);
            return;
          }
          if ((event.key === 'Enter' || event.key === ' ') && open) {
            event.preventDefault();
            chooseOption(activeIndex);
          }
        }}
        role="combobox"
        type="button"
      >
        <span className="dt-custom-select__value">{selectedOption?.label ?? '—'}</span>
        <svg aria-hidden="true" className="dt-custom-select__chevron" viewBox="0 0 24 24">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      <select
        {...selectProps}
        aria-hidden="true"
        className="dt-custom-select__native"
        disabled={disabled}
        onChange={handleNativeChange}
        onInvalid={(event) => {
          onInvalid?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          setInvalid(true);
          triggerRef.current?.focus();
        }}
        ref={nativeRef}
        required={required}
        tabIndex={-1}
        value={currentValue}
      >
        {children}
      </select>
      {menu}
    </div>
  );
}
