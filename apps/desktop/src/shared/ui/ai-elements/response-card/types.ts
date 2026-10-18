export interface ResponseCardLink {
  readonly label: string;
  readonly href: string;
}

export interface ResponseCardData {
  readonly index: string;
  readonly title: string;
  readonly badge?: string;
  readonly body: string;
  readonly caveat?: string;
  readonly link?: ResponseCardLink;
}
