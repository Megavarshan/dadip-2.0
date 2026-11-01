export const prepareElementForPDF = (sourceElement: HTMLElement): HTMLElement => {
  const tempDiv = document.createElement('div');
  tempDiv.style.background = 'white';
  tempDiv.style.width = '800px';
  tempDiv.style.padding = '20px';
  
  const clone = sourceElement.cloneNode(true) as HTMLElement;
  
  // Clean up SVGs which often crash html2canvas
  const svgs = clone.querySelectorAll('svg');
  svgs.forEach(svg => svg.remove());
  
  // Clean up buttons
  const buttons = clone.querySelectorAll('button');
  buttons.forEach(btn => btn.remove());
  
  // Deep inline styles
  const inlineStyles = (src: Element, target: HTMLElement) => {
    const computed = window.getComputedStyle(src);
    const styles = [
      'display', 'flexDirection', 'alignItems', 'justifyContent', 'gap', 'gridTemplateColumns',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'backgroundColor', 'color', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
      'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
      'borderRadius', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'textTransform', 'letterSpacing',
      'width', 'height', 'boxSizing'
    ];
    
    for (const key of styles) {
      let val = computed[key as any];
      // html2canvas crashes on lab/oklch/color functions. Replace with approximations or hex.
      if (val && (val.includes('oklch') || val.includes('lab') || val.includes('color('))) {
        // Fallback rough approximations for Tailwind colors used in our app
        // These are standard sRGB approximations for the UI colors
        if (key.includes('Color') || key === 'backgroundColor') {
          if (val.includes('0.2 0.05')) val = 'rgb(15, 23, 42)'; // slate-900
          else if (val.includes('0.25 0.04')) val = 'rgb(30, 41, 59)'; // slate-800
          else if (val.includes('0.85 0.1')) val = 'rgb(216, 180, 254)'; // purple-300
          else if (val.includes('0.7 0.15')) val = 'rgb(249, 115, 22)'; // orange-500
          else if (val.includes('0.8 0.15')) val = 'rgb(251, 146, 60)'; // orange-400
          else val = 'rgb(255, 255, 255)'; // fallback background
        } else if (key === 'color') {
          val = 'rgb(0, 0, 0)'; // fallback text color
        }
      }
      (target.style as any)[key] = val;
    }
    // Remove class to prevent html2canvas from trying to lookup Tailwind classes
    target.removeAttribute('class');
    
    const srcChildren = src.children;
    const targetChildren = target.children;
    for (let i = 0; i < srcChildren.length; i++) {
      if (targetChildren[i]) {
        inlineStyles(srcChildren[i], targetChildren[i] as HTMLElement);
      }
    }
  };
  
  inlineStyles(sourceElement, clone);
  tempDiv.appendChild(clone);
  return tempDiv;
};
