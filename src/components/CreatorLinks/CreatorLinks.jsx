const TelegramIcon = () => (
  <svg viewBox="0 0 496 512" aria-hidden="true" focusable="false">
    <path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8Zm114.9 169.7-40.7 191.8c-3 13.6-11.1 16.9-22.6 10.5l-62-45.7-29.9 28.8c-3.3 3.3-6.1 6.1-12.5 6.1l4.5-63.1 114.9-103.8c5-4.5-1.1-7-7.7-2.5l-142 89.4-61.2-19.1c-13.3-4.2-13.6-13.3 2.8-19.7l239.1-92.2c11.1-4 20.8 2.7 17.3 19.5Z" />
  </svg>
);

const StudioIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M2.5 3h2.7v15.45h6.15V21H2.5V3Zm7.8 0h2.8l3.75 13.2L20.6 3h2.9l-5.3 18h-2.6L10.3 3Z" />
  </svg>
);

const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.81Z" />
    <path className="creator-link__cutout" d="m9.6 15.55 6.25-3.55L9.6 8.45v7.1Z" />
  </svg>
);

const links = [
  {
    name: "Telegram",
    url: "https://t.me/likeavenus",
    className: "creator-link--telegram",
    icon: TelegramIcon,
  },
  {
    name: "Likeavenus Studio",
    url: "https://likeavenus-studio.ru/",
    className: "creator-link--studio",
    icon: StudioIcon,
  },
  {
    name: "YouTube",
    url: "https://www.youtube.com/@RafaelShepard",
    className: "creator-link--youtube",
    icon: YouTubeIcon,
  },
];

export function CreatorLinks() {
  return (
    <nav className="creator-links" aria-label="Creator links">
      {links.map(({ name, url, className, icon: Icon }) => (
        <a
          key={name}
          className={`creator-link ${className}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={name}
          title={name}
        >
          <Icon />
        </a>
      ))}
    </nav>
  );
}
