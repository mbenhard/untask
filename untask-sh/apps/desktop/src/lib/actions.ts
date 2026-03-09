type FocusOnMountOptions = {
  autosize?: boolean;
  select?: boolean;
};

export function focusOnMount(
  el: HTMLElement,
  options: FocusOnMountOptions = {},
) {
  requestAnimationFrame(() => {
    el.focus();

    if (options.select && el instanceof HTMLInputElement) {
      el.select();
    }

    if (options.autosize && el instanceof HTMLTextAreaElement) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  });
}
