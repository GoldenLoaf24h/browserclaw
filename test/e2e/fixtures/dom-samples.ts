/**
 * DOM Fixtures for E2E Testing
 * Provides realistic, complex, and boundary DOM tree structures.
 */

export interface MockDOMNode {
  id?: string;
  tagName: string;
  role?: string;
  text?: string;
  attributes: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isInteractive: boolean;
  isOccluded?: boolean;
  children: MockDOMNode[];
}

/**
 * Creates an E-Commerce page with ~1,200 nodes including catalog items,
 * filters, hidden modals, scripts, styles, and interactive buttons/inputs.
 */
export function createEcommerceDOM(): MockDOMNode {
  const root: MockDOMNode = {
    tagName: 'html',
    attributes: { lang: 'en' },
    rect: { x: 0, y: 0, width: 1280, height: 2400 },
    isVisible: true,
    isInteractive: false,
    children: [
      {
        tagName: 'head',
        attributes: {},
        rect: { x: 0, y: 0, width: 0, height: 0 },
        isVisible: false,
        isInteractive: false,
        children: [
          { tagName: 'title', text: 'Modern E-Commerce Store', attributes: {}, rect: { x: 0, y: 0, width: 0, height: 0 }, isVisible: false, isInteractive: false, children: [] },
          { tagName: 'style', text: 'body { margin: 0; font-family: sans-serif; }', attributes: {}, rect: { x: 0, y: 0, width: 0, height: 0 }, isVisible: false, isInteractive: false, children: [] },
          { tagName: 'script', text: 'console.log("analytics initialized");', attributes: { src: '/analytics.js' }, rect: { x: 0, y: 0, width: 0, height: 0 }, isVisible: false, isInteractive: false, children: [] },
        ],
      },
      {
        tagName: 'body',
        attributes: { class: 'ecommerce-body' },
        rect: { x: 0, y: 0, width: 1280, height: 2400 },
        isVisible: true,
        isInteractive: false,
        children: [],
      },
    ],
  };

  const body = root.children[1];

  // Header & Navigation (visible interactive elements)
  body.children.push({
    tagName: 'header',
    attributes: { class: 'site-header' },
    rect: { x: 0, y: 0, width: 1280, height: 80 },
    isVisible: true,
    isInteractive: false,
    children: [
      { tagName: 'a', text: 'Store Logo', attributes: { href: '/' }, rect: { x: 20, y: 20, width: 120, height: 40 }, isVisible: true, isInteractive: true, children: [] },
      {
        tagName: 'nav',
        attributes: {},
        rect: { x: 160, y: 20, width: 600, height: 40 },
        isVisible: true,
        isInteractive: false,
        children: [
          { tagName: 'a', text: 'Products', attributes: { href: '/products' }, rect: { x: 160, y: 20, width: 80, height: 40 }, isVisible: true, isInteractive: true, children: [] },
          { tagName: 'a', text: 'Categories', attributes: { href: '/categories' }, rect: { x: 260, y: 20, width: 80, height: 40 }, isVisible: true, isInteractive: true, children: [] },
          { tagName: 'a', text: 'Deals', attributes: { href: '/deals' }, rect: { x: 360, y: 20, width: 60, height: 40 }, isVisible: true, isInteractive: true, children: [] },
        ],
      },
      {
        tagName: 'div',
        attributes: { class: 'search-bar' },
        rect: { x: 800, y: 20, width: 300, height: 40 },
        isVisible: true,
        isInteractive: false,
        children: [
          { tagName: 'input', role: 'searchbox', attributes: { type: 'text', placeholder: 'Search products...', id: 'search-input' }, rect: { x: 800, y: 20, width: 220, height: 40 }, isVisible: true, isInteractive: true, children: [] },
          { tagName: 'button', text: 'Search', attributes: { id: 'search-btn' }, rect: { x: 1030, y: 20, width: 70, height: 40 }, isVisible: true, isInteractive: true, children: [] },
        ],
      },
      { tagName: 'button', text: 'Cart (0)', attributes: { id: 'cart-badge' }, rect: { x: 1150, y: 20, width: 90, height: 40 }, isVisible: true, isInteractive: true, children: [] },
    ],
  });

  // Main content with 50 products, each having ~20 decorative DOM nodes (1,000+ nodes total)
  const main: MockDOMNode = {
    tagName: 'main',
    attributes: { class: 'catalog-grid' },
    rect: { x: 0, y: 90, width: 1280, height: 2000 },
    isVisible: true,
    isInteractive: false,
    children: [],
  };

  for (let i = 1; i <= 50; i++) {
    const isWithinViewport = i <= 8; // First 8 products in first 1000px viewport
    const yPos = 100 + Math.floor((i - 1) / 4) * 180;

    const productCard: MockDOMNode = {
      tagName: 'div',
      attributes: { class: `product-card product-${i}`, 'data-id': String(i) },
      rect: { x: 20 + ((i - 1) % 4) * 310, y: yPos, width: 290, height: 160 },
      isVisible: isWithinViewport,
      isInteractive: false,
      children: [
        { tagName: 'div', attributes: { class: 'image-wrapper' }, rect: { x: 20, y: yPos, width: 290, height: 90 }, isVisible: isWithinViewport, isInteractive: false, children: [
          { tagName: 'img', attributes: { src: `/img/prod${i}.jpg`, alt: `Product ${i}` }, rect: { x: 20, y: yPos, width: 290, height: 90 }, isVisible: isWithinViewport, isInteractive: false, children: [] },
          { tagName: 'span', text: 'NEW', attributes: { class: 'badge' }, rect: { x: 25, y: yPos + 5, width: 40, height: 20 }, isVisible: isWithinViewport, isInteractive: false, children: [] },
        ]},
        { tagName: 'h3', text: `Product Title ${i}`, attributes: {}, rect: { x: 20, y: yPos + 95, width: 200, height: 20 }, isVisible: isWithinViewport, isInteractive: false, children: [] },
        { tagName: 'p', text: `$${(i * 9.99).toFixed(2)}`, attributes: { class: 'price' }, rect: { x: 20, y: yPos + 120, width: 80, height: 20 }, isVisible: isWithinViewport, isInteractive: false, children: [] },
        {
          tagName: 'button',
          text: 'Add to Cart',
          attributes: { class: 'btn-add-cart', 'data-sku': `SKU-${i}` },
          rect: { x: 180, y: yPos + 120, width: 100, height: 30 },
          isVisible: isWithinViewport,
          isInteractive: true,
          children: [],
        },
      ],
    };

    // Add extra decorative child nodes to reach 1000+ total nodes
    for (let d = 0; d < 15; d++) {
      productCard.children.push({
        tagName: 'div',
        attributes: { class: `deco-node-${d}` },
        rect: { x: 0, y: 0, width: 0, height: 0 },
        isVisible: false,
        isInteractive: false,
        children: [],
      });
    }

    main.children.push(productCard);
  }

  body.children.push(main);

  // Hidden checkout modal (not visible until triggered)
  body.children.push({
    tagName: 'div',
    attributes: { id: 'checkout-modal', style: 'display: none;' },
    rect: { x: 0, y: 0, width: 600, height: 500 },
    isVisible: false,
    isInteractive: false,
    children: [
      { tagName: 'input', attributes: { type: 'text', id: 'modal-name' }, rect: { x: 0, y: 0, width: 0, height: 0 }, isVisible: false, isInteractive: true, children: [] },
      { tagName: 'button', text: 'Submit Modal', attributes: { id: 'modal-submit' }, rect: { x: 0, y: 0, width: 0, height: 0 }, isVisible: false, isInteractive: true, children: [] },
    ],
  });

  return root;
}

/**
 * Creates an Admin Portal DOM tree with authentication, file upload inputs,
 * and management actions.
 */
export function createAdminPortalDOM(): MockDOMNode {
  return {
    tagName: 'html',
    attributes: {},
    rect: { x: 0, y: 0, width: 1280, height: 900 },
    isVisible: true,
    isInteractive: false,
    children: [
      {
        tagName: 'body',
        attributes: { class: 'admin-dashboard' },
        rect: { x: 0, y: 0, width: 1280, height: 900 },
        isVisible: true,
        isInteractive: false,
        children: [
          {
            tagName: 'div',
            attributes: { class: 'sidebar' },
            rect: { x: 0, y: 0, width: 240, height: 900 },
            isVisible: true,
            isInteractive: false,
            children: [
              { tagName: 'a', text: 'Dashboard', attributes: { href: '#dashboard' }, rect: { x: 20, y: 40, width: 200, height: 35 }, isVisible: true, isInteractive: true, children: [] },
              { tagName: 'a', text: 'Upload Documents', attributes: { href: '#upload' }, rect: { x: 20, y: 85, width: 200, height: 35 }, isVisible: true, isInteractive: true, children: [] },
              { tagName: 'a', text: 'User Settings', attributes: { href: '#settings' }, rect: { x: 20, y: 130, width: 200, height: 35 }, isVisible: true, isInteractive: true, children: [] },
            ],
          },
          {
            tagName: 'div',
            attributes: { class: 'main-panel' },
            rect: { x: 250, y: 0, width: 1000, height: 900 },
            isVisible: true,
            isInteractive: false,
            children: [
              { tagName: 'h1', text: 'Document Management Portal', attributes: {}, rect: { x: 270, y: 30, width: 400, height: 40 }, isVisible: true, isInteractive: false, children: [] },
              {
                tagName: 'form',
                attributes: { id: 'document-upload-form' },
                rect: { x: 270, y: 90, width: 600, height: 400 },
                isVisible: true,
                isInteractive: false,
                children: [
                  { tagName: 'label', text: 'Document Title', attributes: { for: 'doc-title' }, rect: { x: 270, y: 100, width: 150, height: 25 }, isVisible: true, isInteractive: false, children: [] },
                  { tagName: 'input', attributes: { type: 'text', id: 'doc-title', name: 'docTitle' }, rect: { x: 270, y: 130, width: 400, height: 35 }, isVisible: true, isInteractive: true, children: [] },
                  { tagName: 'label', text: 'Department Category', attributes: { for: 'doc-dept' }, rect: { x: 270, y: 180, width: 150, height: 25 }, isVisible: true, isInteractive: false, children: [] },
                  { tagName: 'select', attributes: { id: 'doc-dept', name: 'dept' }, rect: { x: 270, y: 210, width: 250, height: 35 }, isVisible: true, isInteractive: true, children: [
                    { tagName: 'option', text: 'Finance', attributes: { value: 'finance' }, rect: { x: 0, y: 0, width: 0, height: 0 }, isVisible: true, isInteractive: true, children: [] },
                    { tagName: 'option', text: 'Engineering', attributes: { value: 'engineering' }, rect: { x: 0, y: 0, width: 0, height: 0 }, isVisible: true, isInteractive: true, children: [] },
                  ]},
                  // Standard hidden file input commonly found in modern styled dropzones
                  { tagName: 'input', attributes: { type: 'file', id: 'file-input-hidden', style: 'display: none;' }, rect: { x: 0, y: 0, width: 0, height: 0 }, isVisible: false, isInteractive: true, children: [] },
                  { tagName: 'button', text: 'Browse File...', attributes: { type: 'button', id: 'fake-browse-btn' }, rect: { x: 270, y: 270, width: 140, height: 38 }, isVisible: true, isInteractive: true, children: [] },
                  { tagName: 'button', text: 'Upload & Submit', attributes: { type: 'submit', id: 'submit-upload' }, rect: { x: 430, y: 270, width: 160, height: 38 }, isVisible: true, isInteractive: true, children: [] },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Creates a dynamic SPA social feed with 1,500+ nodes, sticky headers,
 * occluded overlay banner, and infinite scroll cards.
 */
export function create1500NodeFeedDOM(): MockDOMNode {
  const root: MockDOMNode = {
    tagName: 'html',
    attributes: {},
    rect: { x: 0, y: 0, width: 1280, height: 3000 },
    isVisible: true,
    isInteractive: false,
    children: [
      {
        tagName: 'body',
        attributes: {},
        rect: { x: 0, y: 0, width: 1280, height: 3000 },
        isVisible: true,
        isInteractive: false,
        children: [
          // Sticky header at top
          {
            tagName: 'div',
            attributes: { class: 'sticky-header', style: 'position: fixed; top: 0;' },
            rect: { x: 0, y: 0, width: 1280, height: 60 },
            isVisible: true,
            isInteractive: false,
            children: [
              { tagName: 'button', text: 'Feed', attributes: { id: 'tab-feed' }, rect: { x: 100, y: 15, width: 80, height: 30 }, isVisible: true, isInteractive: true, children: [] },
              { tagName: 'button', text: 'Notifications', attributes: { id: 'tab-notifs' }, rect: { x: 200, y: 15, width: 100, height: 30 }, isVisible: true, isInteractive: true, children: [] },
            ],
          },
          // Opaque banner that occludes items beneath it
          {
            tagName: 'div',
            attributes: { class: 'cookie-consent-overlay', style: 'position: fixed; bottom: 0; background: rgba(0,0,0,0.9);' },
            rect: { x: 0, y: 800, width: 1280, height: 100 },
            isVisible: true,
            isInteractive: false,
            children: [
              { tagName: 'p', text: 'We use cookies.', attributes: {}, rect: { x: 20, y: 830, width: 300, height: 30 }, isVisible: true, isInteractive: false, children: [] },
              { tagName: 'button', text: 'Accept All', attributes: { id: 'accept-cookies' }, rect: { x: 1100, y: 825, width: 120, height: 40 }, isVisible: true, isInteractive: true, children: [] },
            ],
          },
        ],
      },
    ],
  };

  const body = root.children[0];
  const feedContainer: MockDOMNode = {
    tagName: 'div',
    attributes: { class: 'feed-stream' },
    rect: { x: 200, y: 70, width: 880, height: 2800 },
    isVisible: true,
    isInteractive: false,
    children: [],
  };

  // Generate 75 feed posts with 20 sub-nodes each = 1,500 nodes
  for (let i = 1; i <= 75; i++) {
    const yPos = 80 + (i - 1) * 120;
    const isWithinViewport = yPos <= 1000;
    // Elements under y=800 to 900 in bottom zone are occluded by cookie banner
    const isOccluded = yPos >= 800 && yPos <= 900;

    const postNode: MockDOMNode = {
      tagName: 'article',
      attributes: { class: `feed-item feed-${i}` },
      rect: { x: 200, y: yPos, width: 880, height: 100 },
      isVisible: isWithinViewport,
      isInteractive: false,
      isOccluded,
      children: [
        { tagName: 'h4', text: `Post Author ${i}`, attributes: {}, rect: { x: 210, y: yPos + 10, width: 200, height: 20 }, isVisible: isWithinViewport, isInteractive: false, children: [] },
        { tagName: 'p', text: `Status update message for item ${i} containing dynamic text.`, attributes: {}, rect: { x: 210, y: yPos + 35, width: 600, height: 25 }, isVisible: isWithinViewport, isInteractive: false, children: [] },
        { tagName: 'button', text: 'Like', attributes: { class: 'btn-like', 'data-id': String(i) }, rect: { x: 210, y: yPos + 65, width: 60, height: 25 }, isVisible: isWithinViewport && !isOccluded, isInteractive: true, isOccluded, children: [] },
        { tagName: 'button', text: 'Comment', attributes: { class: 'btn-comment', 'data-id': String(i) }, rect: { x: 280, y: yPos + 65, width: 80, height: 25 }, isVisible: isWithinViewport && !isOccluded, isInteractive: true, isOccluded, children: [] },
      ],
    };

    for (let c = 0; c < 16; c++) {
      postNode.children.push({
        tagName: 'span',
        attributes: { class: `deco-span-${c}` },
        rect: { x: 0, y: 0, width: 0, height: 0 },
        isVisible: false,
        isInteractive: false,
        children: [],
      });
    }

    feedContainer.children.push(postNode);
  }

  body.children.push(feedContainer);
  return root;
}

/**
 * Creates a DOM nested N levels deep to test boundary handling.
 */
export function createDeeplyNestedDOM(depth: number): MockDOMNode {
  const root: MockDOMNode = {
    tagName: 'div',
    attributes: { id: 'depth-root' },
    rect: { x: 0, y: 0, width: 500, height: 500 },
    isVisible: true,
    isInteractive: false,
    children: [],
  };

  let current = root;
  for (let d = 1; d <= depth; d++) {
    const next: MockDOMNode = {
      tagName: 'div',
      attributes: { 'data-depth': String(d) },
      rect: { x: 0, y: 0, width: 500, height: 500 },
      isVisible: true,
      isInteractive: false,
      children: [],
    };
    current.children.push(next);
    current = next;
  }

  // Deepest node is an interactive button
  current.children.push({
    tagName: 'button',
    text: 'Deepest Button',
    attributes: { id: 'deep-btn' },
    rect: { x: 10, y: 10, width: 120, height: 35 },
    isVisible: true,
    isInteractive: true,
    children: [],
  });

  return root;
}

/**
 * Count total nodes in a DOM tree recursively
 */
export function countTotalNodes(node: MockDOMNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countTotalNodes(child);
  }
  return count;
}
