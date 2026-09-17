import { WRAPPABLE_ANCESTOR_TAGS } from "./constants";

function cloneRangeWithInlineAncestors(range: Range): DocumentFragment {
  let fragment = document.createDocumentFragment();
  fragment.append(range.cloneContents());

  const container = range.commonAncestorContainer;
  let ancestor =
    container instanceof Element ? container : container.parentElement;

  while (
    ancestor &&
    WRAPPABLE_ANCESTOR_TAGS.has(ancestor.tagName.toLowerCase())
  ) {
    const wrapper = ancestor.cloneNode(false) as Element;
    wrapper.append(fragment);

    const wrapped = document.createDocumentFragment();
    wrapped.append(wrapper);
    fragment = wrapped;

    ancestor = ancestor.parentElement;
  }

  return fragment;
}


export function cloneSelectionContents(selection: Selection): DocumentFragment {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < selection.rangeCount; index += 1) {
    fragment.append(cloneRangeWithInlineAncestors(selection.getRangeAt(index)));
  }

  return fragment;
}
