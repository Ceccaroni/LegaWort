(function(){
  'use strict';
  if (typeof window === 'undefined') {
    return;
  }
  const formsMap = window.LEGA_FORMS_MAP || window.formsMap;
  if (!formsMap) {
    console.warn('forms.map.json fehlt');
    return;
  }
  if (typeof window.LEGA_REGISTER_FORMS === 'function') {
    try {
      window.LEGA_REGISTER_FORMS(formsMap);
    } catch (err) {
      console.warn('forms redirect registration fehlgeschlagen', err);
    }
  }
})();
