/**
 * @fileoverview Type definitions for the WebUI grid layout system.
 *
 * Defines shared interfaces for GridStack-backed layout management in the
 * browser-based WebUI. These types describe component metadata, layout
 * serialization formats, persistence payloads, and callback signatures used
 * by the Grid manager and persistence layer. The definitions are intentionally
 * decoupled from Electron renderer-specific types to keep the WebUI self-
 * contained and browser-friendly.
 */

export interface WebUIGridOptions {
  column?: number;
  cellHeight?: number | string;
  margin?: number;
  staticGrid?: boolean;
  float?: boolean;
  animate?: boolean;
  minRow?: number;
  sizeToContent?: boolean;
  [key: string]: unknown;
}

export type WebUIWidgetConfig = Record<string, unknown>;

export interface WebUIComponentSize {
  w: number;
  h: number;
}

export interface WebUIComponentPosition {
  x: number;
  y: number;
}

export interface WebUIComponentDefinition {
  id: string;
  displayName: string;
  defaultSize: WebUIComponentSize;
  minSize: WebUIComponentSize;
  maxSize?: WebUIComponentSize;
  defaultPosition?: WebUIComponentPosition;
}

export interface WebUIComponentLayout extends WebUIComponentSize, WebUIComponentPosition {
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  locked?: boolean;
}

export type WebUIComponentLayoutMap = Record<string, WebUIComponentLayout | undefined>;

export interface WebUIGridLayout {
  components: WebUIComponentLayoutMap;
  hiddenComponents?: string[];
  version?: number;
}

export type WebUIGridChangeCallback = (layout: WebUIGridLayout) => void;

export interface WebUIComponentTemplate {
  id: string;
  html: string;
}

export interface WebUIStoredLayout {
  updatedAt: number;
  layout: WebUIGridLayout;
}
