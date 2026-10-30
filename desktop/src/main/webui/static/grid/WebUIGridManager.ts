/**
 * @fileoverview Bambu Studio Dashboard layout manager for the WebUI.
 *
 * Mounts and manages component widgets in the fixed Bambu Studio 2-column layout
 * without drag-and-drop reorganization overhead, while maintaining the same
 * public API for seamless integration and zero regression.
 */

import type { WebUIComponentLayout, WebUIGridChangeCallback, WebUIGridLayout, WebUIGridOptions } from './types.js';
import { createComponentElement, DEFAULT_LAYOUT } from './WebUIComponentRegistry.js';
import { applyModelPreviewVisibility, isModelPreviewVisible } from '../features/job-control.js';

const HIDDEN_CLASS = 'grid-item-hidden';

export class WebUIGridManager {
  private container: HTMLElement | null = null;
  private readonly changeHandlers = new Set<WebUIGridChangeCallback>();
  private readonly hiddenComponents = new Set<string>();
  private isInitialized = false;

  constructor(private readonly containerSelector: string) {}

  public initialize(_options?: WebUIGridOptions): void {
    if (this.isInitialized) {
      return;
    }

    const element =
      document.querySelector<HTMLElement>(this.containerSelector) ||
      document.getElementById('device-dashboard') ||
      document.body;

    this.container = element;
    this.isInitialized = true;
  }

  public clear(): void {
    const leftCol = document.getElementById('status-col-left');
    const rightCol = document.getElementById('status-col-right');
    if (leftCol) leftCol.innerHTML = '';
    if (rightCol) rightCol.innerHTML = '';

    const root = this.container;
    if (root) {
      root.querySelectorAll('.panel-widget-wrapper').forEach((el) => el.remove());
    }
    this.hiddenComponents.clear();
  }

  public addComponent(componentId: string, _layout?: WebUIComponentLayout): HTMLElement {
    const leftCol = document.getElementById('status-col-left');
    const rightCol = document.getElementById('status-col-right');

    let targetParent: HTMLElement | null = null;
    if (componentId === 'camera') {
      targetParent = leftCol;
    } else if (componentId === 'controls' || componentId === 'job-progress' || componentId === 'ams') {
      targetParent = rightCol;
    } else {
      targetParent = rightCol || leftCol || this.container;
    }

    const existing = document.querySelector<HTMLElement>(`.panel-widget-wrapper[data-component-id="${componentId}"]`);
    if (existing && existing.parentElement) {
      existing.parentElement.removeChild(existing);
    }

    const widget = document.createElement('div');
    widget.classList.add('panel-widget-wrapper');
    widget.id = componentId;
    widget.dataset.componentId = componentId;

    const panelElement = createComponentElement(componentId);
    widget.appendChild(panelElement);

    if (targetParent) {
      targetParent.appendChild(widget);
    } else if (this.container) {
      this.container.appendChild(widget);
    }

    if (this.hiddenComponents.has(componentId)) {
      this.hideComponent(componentId);
    } else {
      this.showComponent(componentId);
    }

    if (componentId === 'job-progress') {
      applyModelPreviewVisibility(isModelPreviewVisible());
    }

    return widget;
  }

  public removeComponent(componentId: string): void {
    const target = document.querySelector<HTMLElement>(`[data-component-id="${componentId}"]`);
    if (target) {
      target.remove();
    }
    this.hiddenComponents.delete(componentId);
  }

  public hideComponent(componentId: string): void {
    const element = this.getWidgetElement(componentId);
    if (!element) {
      this.hiddenComponents.add(componentId);
      return;
    }
    element.classList.add(HIDDEN_CLASS);
    this.hiddenComponents.add(componentId);
  }

  public showComponent(componentId: string): void {
    const element = this.getWidgetElement(componentId);
    if (element) {
      element.classList.remove(HIDDEN_CLASS);
    }
    this.hiddenComponents.delete(componentId);
  }

  public enableEdit(): void {
    // Dragging to reorganize is removed in Bambu layout
  }

  public disableEdit(): void {
    // Dragging to reorganize is removed in Bambu layout
  }

  public serialize(): WebUIGridLayout {
    return {
      version: DEFAULT_LAYOUT.version,
      components: { ...DEFAULT_LAYOUT.components },
      hiddenComponents: Array.from(this.hiddenComponents),
    };
  }

  public load(layout: WebUIGridLayout): void {
    this.clear();
    const components = layout?.components ?? DEFAULT_LAYOUT.components ?? {};
    const renderOrder = ['camera', 'controls', 'job-progress', 'ams'];
    renderOrder.forEach((id) => {
      this.addComponent(id, components[id] || DEFAULT_LAYOUT.components[id]);
    });

    const hidden = layout?.hiddenComponents ?? [];
    hidden.forEach((componentId) => this.hideComponent(componentId));
  }

  public onChange(callback: WebUIGridChangeCallback): () => void {
    this.changeHandlers.add(callback);
    return () => this.changeHandlers.delete(callback);
  }

  public destroy(): void {
    this.clear();
    this.isInitialized = false;
  }

  private getWidgetElement(componentId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-component-id="${componentId}"]`);
  }
}
