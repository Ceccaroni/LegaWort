(function(root){
  'use strict';

  function hyphenNormalize(value){
    return String(value || '')
      .toLowerCase()
      .normalize('NFKC');
  }

  function parsePattern(pattern){
    if(!pattern) return null;
    const text = String(pattern);
    if(!text.trim()) return null;
    const letters = [];
    const numbers = [];
    for(let i = 0; i < text.length; i++){
      const ch = text[i];
      if(ch >= '0' && ch <= '9'){
        numbers.push(Number(ch));
      }else{
        letters.push(ch);
        if(numbers.length < letters.length){
          numbers.push(0);
        }
      }
    }
    while(numbers.length < letters.length + 1){
      numbers.push(0);
    }
    const joined = letters.join('');
    if(!joined){
      return null;
    }
    return { letters: joined, numbers };
  }

  function splitException(text){
    return String(text || '')
      .split('-')
      .map(part => part.replace(/[.\s]+/g, '').trim())
      .filter(Boolean);
  }

  function compileHyphenation(raw){
    if(!raw || typeof raw !== 'object') return null;
    const params = Object.assign({
      left_hyphen_min: 2,
      right_hyphen_min: 2,
      min_word_length: 3
    }, raw.parameters || {});

    const patternList = (raw.liang_patterns && Array.isArray(raw.liang_patterns.common_patterns))
      ? raw.liang_patterns.common_patterns
      : [];
    const patterns = [];
    for(const item of patternList){
      const parsed = parsePattern(item);
      if(parsed){
        patterns.push(parsed);
      }
    }

    const vowelList = (raw.basic_rules && Array.isArray(raw.basic_rules.vowels))
      ? raw.basic_rules.vowels.map(v => hyphenNormalize(v))
      : [];
    const vowelSet = new Set(vowelList.filter(Boolean));

    const exceptions = {};
    const exceptionList = raw.exceptions && Array.isArray(raw.exceptions.list)
      ? raw.exceptions.list
      : [];
    for(const entry of exceptionList){
      if(!entry || !entry.word) continue;
      const key = hyphenNormalize(entry.word);
      if(!key) continue;
      const parts = splitException(entry.hyphenation || '');
      if(parts.length){
        exceptions[key] = parts;
      }
    }

    return {
      params,
      patterns,
      vowelSet,
      exceptions
    };
  }

  function containsVowel(part, vowelSet){
    if(!part) return false;
    const normalized = hyphenNormalize(part);
    for(let i = 0; i < normalized.length; i++){
      if(vowelSet.has(normalized[i])){
        return true;
      }
    }
    return false;
  }

  function applyException(word, parts){
    const original = String(word || '');
    if(!parts || !parts.length) return null;
    const mapped = [];
    let offset = 0;
    for(const rawPart of parts){
      const clean = String(rawPart || '').replace(/[.\s]+/g, '');
      if(!clean){
        return null;
      }
      const length = clean.length;
      const slice = original.slice(offset, offset + length);
      if(!slice){
        return null;
      }
      mapped.push(slice);
      offset += length;
    }
    if(offset < original.length){
      mapped.push(original.slice(offset));
    }
    if(!mapped.length || mapped.join('') !== original){
      return null;
    }
    return mapped;
  }

  function hyphenate(word, compiled){
    if(!word) return [];
    const original = String(word);
    if(!compiled || !compiled.patterns){
      return [original];
    }
    const params = compiled.params || {};
    const normalized = hyphenNormalize(original);
    if(normalized.length < (params.min_word_length || 0)){
      return [original];
    }

    const exceptionKey = normalized;
    if(compiled.exceptions && compiled.exceptions[exceptionKey]){
      const mapped = applyException(original, compiled.exceptions[exceptionKey]);
      if(mapped && mapped.length){
        return mapped;
      }
    }

    const text = `${params.word_boundary_marker || '.'}${normalized}${params.word_boundary_marker || '.'}`;
    const scores = new Array(text.length + 1).fill(0);

    for(const pattern of compiled.patterns){
      if(!pattern || !pattern.letters) continue;
      const letters = pattern.letters;
      let index = text.indexOf(letters);
      while(index !== -1){
        const numbers = pattern.numbers;
        for(let i = 0; i < numbers.length; i++){
          const pos = index + i;
          const val = numbers[i] || 0;
          if(val > (scores[pos] || 0)){
            scores[pos] = val;
          }
        }
        index = text.indexOf(letters, index + 1);
      }
    }

    const leftMin = params.left_hyphen_min || 2;
    const rightMin = params.right_hyphen_min || 2;
    const cutPositions = [];
    for(let i = leftMin; i <= normalized.length - rightMin; i++){
      const score = scores[i + 1];
      if(score % 2 === 1){
        cutPositions.push(i);
      }
    }

    if(!cutPositions.length){
      return [original];
    }

    const result = [];
    let prev = 0;
    for(const pos of cutPositions){
      const slice = original.slice(prev, pos);
      if(slice){
        result.push(slice);
      }
      prev = pos;
    }
    const tail = original.slice(prev);
    if(tail){
      result.push(tail);
    }

    if(!result.length){
      return [original];
    }

    const vowelSet = compiled.vowelSet || new Set();
    const valid = result.every(part => containsVowel(part, vowelSet));
    if(!valid){
      return [original];
    }

    return result;
  }

  const api = {
    hyphenate,
    compileHyphenation,
    hyphenNormalize,
    parsePattern,
    containsVowel
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = api;
  }
  if(root){
    root.LegaHyphenation = Object.assign(root.LegaHyphenation || {}, api);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : global));
