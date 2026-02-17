"""
Word Validator Service
======================
Validates that deletion reasons contain real English words.
Requirements:
- Minimum 100 valid words
- Words must be 4+ letters
- Words must be in English lexicon
"""

import re
from typing import Tuple, List
import os

# Common English words (4+ letters) - a subset of the most common words
# This is a curated list of ~10000 common English words
COMMON_WORDS_FILE = os.path.join(os.path.dirname(__file__), 'english_words.txt')

# Fallback: Basic common words if file doesn't exist
BASIC_COMMON_WORDS = {
    # Common verbs
    'have', 'been', 'were', 'being', 'would', 'could', 'should', 'about', 'after',
    'again', 'also', 'back', 'because', 'before', 'between', 'both', 'came', 'come',
    'could', 'does', 'done', 'down', 'each', 'even', 'find', 'first', 'found', 'from',
    'give', 'going', 'good', 'great', 'hand', 'have', 'here', 'high', 'home', 'house',
    'into', 'just', 'keep', 'know', 'last', 'left', 'life', 'like', 'line', 'little',
    'long', 'look', 'made', 'make', 'many', 'more', 'most', 'much', 'must', 'name',
    'never', 'next', 'night', 'nothing', 'number', 'only', 'other', 'over', 'part',
    'people', 'place', 'point', 'right', 'said', 'same', 'seem', 'should', 'show',
    'side', 'small', 'some', 'something', 'sound', 'still', 'such', 'take', 'tell',
    'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'thing',
    'think', 'this', 'those', 'thought', 'three', 'through', 'time', 'together',
    'told', 'took', 'turn', 'under', 'until', 'upon', 'used', 'very', 'want', 'water',
    'well', 'went', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'without',
    'word', 'work', 'world', 'would', 'write', 'year', 'young',
    # Business/payroll related
    'payroll', 'employee', 'salary', 'payment', 'error', 'mistake', 'incorrect',
    'wrong', 'duplicate', 'period', 'calculation', 'deduction', 'amount', 'total',
    'correction', 'adjustment', 'review', 'approved', 'rejected', 'cancelled',
    'deleted', 'removed', 'reason', 'because', 'since', 'therefore', 'however',
    'although', 'request', 'requested', 'system', 'process', 'processing',
    'created', 'updated', 'modified', 'changed', 'fixed', 'resolved', 'issue',
    'problem', 'report', 'reported', 'during', 'testing', 'tested', 'verified',
    'confirmed', 'submitted', 'approved', 'rejected', 'pending', 'completed',
    'data', 'information', 'record', 'records', 'entry', 'entries', 'date',
    'month', 'weekly', 'monthly', 'annual', 'yearly', 'quarter', 'quarterly',
    'department', 'company', 'business', 'organization', 'management', 'manager',
    'admin', 'administrator', 'user', 'users', 'account', 'accounts', 'finance',
    'financial', 'budget', 'expense', 'expenses', 'cost', 'costs', 'income',
    'revenue', 'profit', 'loss', 'balance', 'statement', 'invoice', 'billing',
    'transaction', 'transfer', 'bank', 'banking', 'cash', 'check', 'credit',
    'debit', 'loan', 'loans', 'contribution', 'contributions', 'benefit',
    'benefits', 'insurance', 'health', 'medical', 'dental', 'vision', 'retirement',
    'pension', 'bonus', 'bonuses', 'commission', 'commissions', 'overtime',
    'hours', 'worked', 'absent', 'absence', 'leave', 'vacation', 'holiday',
    'sick', 'personal', 'emergency', 'attendance', 'schedule', 'shift', 'shifts',
    'regular', 'special', 'standard', 'custom', 'default', 'setting', 'settings',
    'configuration', 'option', 'options', 'selection', 'selected', 'choose',
    'chosen', 'specified', 'specific', 'general', 'particular', 'certain',
    'various', 'different', 'similar', 'same', 'equal', 'exact', 'accurate',
    'correct', 'valid', 'invalid', 'true', 'false', 'required', 'optional',
    'mandatory', 'necessary', 'needed', 'important', 'critical', 'urgent',
    'priority', 'level', 'status', 'state', 'condition', 'situation', 'case',
    'instance', 'example', 'sample', 'test', 'tests', 'check', 'verify',
    'validate', 'confirm', 'ensure', 'make', 'sure', 'certain', 'clear',
    'unclear', 'known', 'unknown', 'expected', 'unexpected', 'normal',
    'abnormal', 'usual', 'unusual', 'common', 'rare', 'frequent', 'occasional',
    'always', 'never', 'sometimes', 'often', 'rarely', 'usually', 'typically',
    'generally', 'specifically', 'exactly', 'approximately', 'roughly', 'about',
    'around', 'nearly', 'almost', 'completely', 'fully', 'partially', 'partly',
    'entirely', 'totally', 'absolutely', 'definitely', 'certainly', 'probably',
    'possibly', 'likely', 'unlikely', 'perhaps', 'maybe', 'might', 'could',
    'would', 'should', 'must', 'have', 'need', 'want', 'like', 'prefer',
    'require', 'demand', 'expect', 'hope', 'wish', 'believe', 'think', 'know',
    'understand', 'realize', 'recognize', 'notice', 'observe', 'watch', 'look',
    'view', 'review', 'examine', 'inspect', 'analyze', 'evaluate', 'assess',
    'measure', 'calculate', 'compute', 'count', 'determine', 'decide', 'choose',
    'select', 'pick', 'find', 'search', 'seek', 'locate', 'identify', 'detect',
    'discover', 'uncover', 'reveal', 'show', 'display', 'present', 'demonstrate',
    'explain', 'describe', 'define', 'clarify', 'illustrate', 'indicate', 'suggest',
    'imply', 'mean', 'signify', 'represent', 'stand', 'refer', 'relate', 'connect',
    'link', 'associate', 'combine', 'merge', 'join', 'unite', 'integrate', 'include',
    'exclude', 'contain', 'consist', 'comprise', 'involve', 'concern', 'affect',
    'impact', 'influence', 'change', 'modify', 'alter', 'adjust', 'adapt', 'convert',
    'transform', 'replace', 'substitute', 'exchange', 'swap', 'switch', 'shift',
    'move', 'transfer', 'send', 'receive', 'give', 'take', 'bring', 'carry', 'hold',
    'keep', 'maintain', 'preserve', 'protect', 'secure', 'save', 'store', 'record',
    'document', 'file', 'archive', 'backup', 'restore', 'recover', 'retrieve',
    'access', 'open', 'close', 'start', 'begin', 'stop', 'finish', 'complete',
    'accomplish', 'achieve', 'succeed', 'fail', 'pass', 'miss', 'skip', 'omit',
    'ignore', 'overlook', 'forget', 'remember', 'recall', 'remind', 'note', 'mark',
    'label', 'tag', 'name', 'title', 'call', 'refer', 'mention', 'cite', 'quote',
    'state', 'declare', 'announce', 'report', 'inform', 'notify', 'alert', 'warn',
    'advise', 'recommend', 'suggest', 'propose', 'offer', 'provide', 'supply',
    'deliver', 'distribute', 'allocate', 'assign', 'designate', 'appoint', 'hire',
    'employ', 'fire', 'terminate', 'dismiss', 'release', 'free', 'allow', 'permit',
    'authorize', 'approve', 'accept', 'agree', 'consent', 'refuse', 'reject', 'deny',
    'decline', 'cancel', 'void', 'nullify', 'revoke', 'withdraw', 'remove', 'delete',
    'erase', 'clear', 'clean', 'empty', 'fill', 'load', 'unload', 'upload', 'download',
    'import', 'export', 'input', 'output', 'enter', 'exit', 'leave', 'return', 'come',
    'arrive', 'depart', 'proceed', 'continue', 'resume', 'pause', 'wait', 'delay',
    'postpone', 'defer', 'extend', 'expand', 'enlarge', 'increase', 'raise', 'grow',
    'reduce', 'decrease', 'lower', 'shrink', 'minimize', 'maximize', 'optimize',
    'improve', 'enhance', 'upgrade', 'update', 'renew', 'refresh', 'reset', 'restart',
    # More common words
    'actual', 'actually', 'additional', 'address', 'advance', 'advanced', 'advantage',
    'advice', 'affect', 'affected', 'afternoon', 'agency', 'agent', 'agree', 'agreement',
    'ahead', 'allow', 'allowed', 'alone', 'along', 'already', 'alternative', 'although',
    'among', 'analysis', 'another', 'answer', 'anyone', 'anything', 'appear', 'application',
    'apply', 'approach', 'appropriate', 'area', 'argument', 'article', 'artist', 'asked',
    'asking', 'assume', 'attention', 'attorney', 'audience', 'author', 'authority',
    'available', 'average', 'avoid', 'aware', 'based', 'basic', 'beautiful', 'become',
    'becoming', 'began', 'beginning', 'behavior', 'behind', 'believe', 'benefit', 'best',
    'better', 'beyond', 'bill', 'billion', 'black', 'blood', 'blue', 'board', 'body',
    'book', 'born', 'bring', 'brother', 'brought', 'build', 'building', 'business',
    'called', 'campaign', 'capital', 'care', 'career', 'carry', 'case', 'cause', 'center',
    'central', 'century', 'certain', 'certainly', 'challenge', 'chance', 'change', 'changed',
    'character', 'charge', 'child', 'children', 'choice', 'church', 'citizen', 'city',
    'civil', 'claim', 'class', 'clear', 'clearly', 'client', 'close', 'coach', 'cold',
    'collection', 'college', 'color', 'commercial', 'common', 'community', 'companies',
    'compare', 'computer', 'concern', 'concerned', 'condition', 'conditions', 'conference',
    'congress', 'consider', 'considered', 'consumer', 'continue', 'continued', 'control',
    'corporate', 'country', 'couple', 'course', 'court', 'cover', 'create', 'created',
    'crime', 'crisis', 'cultural', 'culture', 'current', 'currently', 'customer', 'daily',
    'daughter', 'dead', 'deal', 'death', 'debate', 'decade', 'decide', 'decided', 'decision',
    'deep', 'defense', 'degree', 'democrat', 'democratic', 'describe', 'described', 'design',
    'despite', 'detail', 'details', 'determine', 'develop', 'developed', 'development',
    'difference', 'difficult', 'dinner', 'direction', 'director', 'discovered', 'discuss',
    'discussion', 'disease', 'doctor', 'does', 'doing', 'dollar', 'dollars', 'domestic',
    'door', 'doubt', 'draw', 'dream', 'drive', 'drop', 'drug', 'drugs', 'early', 'earth',
    'east', 'easy', 'economic', 'economy', 'edge', 'education', 'effect', 'effective',
    'effort', 'eight', 'either', 'election', 'else', 'employee', 'employees', 'energy',
    'enjoy', 'enough', 'enter', 'entire', 'environment', 'environmental', 'especially',
    'establish', 'established', 'european', 'evening', 'event', 'events', 'eventually',
    'ever', 'every', 'everybody', 'everyone', 'everything', 'evidence', 'exactly', 'example',
    'executive', 'exist', 'expect', 'expected', 'experience', 'explain', 'express', 'extend',
    'face', 'facility', 'fact', 'factor', 'factors', 'fail', 'failed', 'fall', 'family',
    'famous', 'fast', 'father', 'fear', 'feature', 'features', 'federal', 'feel', 'feeling',
    'feet', 'field', 'fight', 'figure', 'fill', 'film', 'final', 'finally', 'financial',
    'fine', 'fire', 'firm', 'fish', 'five', 'floor', 'focus', 'follow', 'following', 'food',
    'foot', 'football', 'force', 'forces', 'foreign', 'forget', 'form', 'former', 'forward',
    'four', 'free', 'freedom', 'friend', 'friends', 'front', 'full', 'function', 'fund',
    'future', 'game', 'games', 'garden', 'general', 'generally', 'generation', 'girl',
    'given', 'glass', 'global', 'goal', 'goes', 'gold', 'gone', 'government', 'green',
    'ground', 'group', 'groups', 'grow', 'growing', 'growth', 'guess', 'gun', 'guns',
    'hair', 'half', 'hall', 'happy', 'hard', 'head', 'health', 'hear', 'heard', 'heart',
    'heat', 'heavy', 'held', 'help', 'helped', 'herself', 'hide', 'himself', 'history',
    'hold', 'holding', 'hole', 'hope', 'hospital', 'host', 'hotel', 'hour', 'hours',
    'housing', 'however', 'huge', 'human', 'hundred', 'husband', 'idea', 'ideas', 'identify',
    'image', 'imagine', 'immediately', 'impact', 'important', 'improve', 'include', 'included',
    'including', 'increase', 'increased', 'indeed', 'independent', 'individual', 'individuals',
    'industry', 'inside', 'instead', 'institution', 'interest', 'interested', 'interesting',
    'international', 'interview', 'investment', 'involved', 'island', 'issue', 'issues',
    'item', 'itself', 'job', 'jobs', 'join', 'joint', 'journal', 'judge', 'just', 'justice',
    'keep', 'kept', 'key', 'kid', 'kids', 'kill', 'killed', 'kind', 'king', 'kitchen',
    'knew', 'knowledge', 'known', 'labor', 'lack', 'land', 'language', 'large', 'largely',
    'last', 'late', 'later', 'latest', 'laugh', 'laughed', 'launch', 'lead', 'leader',
    'leaders', 'leadership', 'leading', 'learn', 'learned', 'learning', 'least', 'leave',
    'legal', 'less', 'letter', 'level', 'levels', 'liberal', 'library', 'likely', 'limit',
    'limited', 'list', 'listen', 'little', 'live', 'lived', 'lives', 'living', 'local',
    'location', 'long', 'longer', 'look', 'looked', 'looking', 'lord', 'lose', 'loss',
    'lost', 'love', 'lower', 'machine', 'magazine', 'main', 'maintain', 'major', 'majority',
    'making', 'male', 'manage', 'management', 'manager', 'manner', 'manufacturing', 'market',
    'marketing', 'marriage', 'married', 'mass', 'master', 'match', 'material', 'matter',
    'maybe', 'mayor', 'mean', 'meaning', 'means', 'measure', 'measures', 'media', 'medical',
    'meet', 'meeting', 'member', 'members', 'memory', 'mention', 'mentioned', 'message',
    'method', 'middle', 'might', 'military', 'million', 'millions', 'mind', 'mine', 'minister',
    'minute', 'minutes', 'miss', 'mission', 'model', 'modern', 'moment', 'money', 'month',
    'months', 'moral', 'morning', 'mother', 'mouth', 'move', 'moved', 'movement', 'movie',
    'movies', 'moving', 'murder', 'museum', 'music', 'myself', 'national', 'natural',
    'nature', 'near', 'nearly', 'necessary', 'need', 'needed', 'needs', 'negative', 'neither',
    'network', 'news', 'newspaper', 'nice', 'nine', 'none', 'normal', 'north', 'note',
    'noted', 'notes', 'nothing', 'notice', 'novel', 'nuclear', 'occur', 'offer', 'offered',
    'office', 'officer', 'official', 'officials', 'once', 'ones', 'online', 'onto', 'operation',
    'operations', 'opportunity', 'opposition', 'order', 'organization', 'organizations',
    'original', 'others', 'otherwise', 'outside', 'owner', 'page', 'pain', 'paint', 'painting',
    'pair', 'paper', 'parent', 'parents', 'park', 'particularly', 'partner', 'partners',
    'party', 'pass', 'passed', 'past', 'patient', 'patients', 'pattern', 'peace', 'percent',
    'perfect', 'perform', 'performance', 'perhaps', 'period', 'permission', 'permitted',
    'person', 'personal', 'phone', 'photo', 'physical', 'pick', 'picked', 'picture', 'piece',
    'pieces', 'place', 'placed', 'places', 'plan', 'plane', 'planning', 'plans', 'plant',
    'play', 'played', 'player', 'players', 'playing', 'please', 'plus', 'pocket', 'poem',
    'point', 'pointed', 'points', 'police', 'policies', 'policy', 'political', 'politics',
    'poll', 'poor', 'popular', 'population', 'position', 'positive', 'possible', 'post',
    'potential', 'pound', 'pounds', 'power', 'powerful', 'practice', 'prepare', 'prepared',
    'presence', 'present', 'presented', 'president', 'presidential', 'press', 'pressure',
    'pretty', 'prevent', 'previous', 'previously', 'price', 'prices', 'primary', 'prime',
    'principle', 'principles', 'print', 'prison', 'private', 'probably', 'problem', 'problems',
    'process', 'produce', 'produced', 'product', 'production', 'products', 'professional',
    'professor', 'program', 'programs', 'progress', 'project', 'projects', 'promise',
    'promised', 'property', 'proposal', 'proposed', 'protect', 'protection', 'prove',
    'provide', 'provided', 'provides', 'providing', 'public', 'published', 'pull', 'pulled',
    'purpose', 'push', 'pushed', 'putting', 'quality', 'question', 'questions', 'quick',
    'quickly', 'quite', 'race', 'radio', 'raise', 'raised', 'range', 'rate', 'rates',
    'rather', 'reach', 'reached', 'read', 'reader', 'readers', 'reading', 'ready', 'real',
    'reality', 'realize', 'realized', 'really', 'reason', 'reasons', 'receive', 'received',
    'recent', 'recently', 'recognize', 'recognized', 'record', 'recorded', 'recording',
    'records', 'reduce', 'reduced', 'reference', 'reflect', 'reform', 'refuse', 'refused',
    'regard', 'regarding', 'region', 'regional', 'regular', 'related', 'relation', 'relations',
    'relationship', 'relationships', 'relatively', 'release', 'released', 'relevant', 'religious',
    'remain', 'remained', 'remaining', 'remains', 'remember', 'remembered', 'remove', 'removed',
    'replace', 'replaced', 'report', 'reported', 'reporter', 'reporters', 'reporting', 'reports',
    'represent', 'representative', 'representatives', 'represented', 'republic', 'republican',
    'republicans', 'require', 'required', 'requires', 'research', 'researcher', 'researchers',
    'resource', 'resources', 'respect', 'respond', 'responded', 'response', 'responsibility',
    'responsible', 'rest', 'restaurant', 'result', 'results', 'return', 'returned', 'reveal',
    'revealed', 'rich', 'ride', 'riding', 'rights', 'rise', 'risk', 'river', 'road', 'rock',
    'role', 'room', 'rule', 'rules', 'running', 'rural', 'safe', 'safety', 'sale', 'sales',
    'save', 'saved', 'saying', 'says', 'scale', 'scene', 'scenes', 'school', 'schools',
    'science', 'scientific', 'scientist', 'scientists', 'score', 'screen', 'search', 'season',
    'seat', 'second', 'seconds', 'secret', 'secretary', 'section', 'sector', 'security',
    'seeking', 'seem', 'seemed', 'seems', 'seen', 'self', 'sell', 'selling', 'senate',
    'senator', 'senators', 'send', 'senior', 'sense', 'sent', 'separate', 'series', 'serious',
    'seriously', 'serve', 'served', 'server', 'service', 'services', 'session', 'seven',
    'several', 'severe', 'sexual', 'shall', 'shape', 'share', 'shared', 'shares', 'sharing',
    'sharp', 'shoot', 'shooting', 'shop', 'shopping', 'short', 'shot', 'shoulder', 'shout',
    'shouted', 'showed', 'showing', 'shown', 'shows', 'shut', 'sign', 'signed', 'significant',
    'signs', 'silence', 'similar', 'simple', 'simply', 'since', 'sing', 'single', 'sister',
    'site', 'sites', 'sitting', 'situation', 'size', 'skill', 'skills', 'skin', 'sleep',
    'slightly', 'slow', 'slowly', 'smaller', 'smile', 'smiled', 'snow', 'social', 'society',
    'soft', 'software', 'soil', 'soldier', 'soldiers', 'solid', 'solution', 'solutions',
    'solve', 'somebody', 'somehow', 'someone', 'soon', 'sorry', 'sort', 'sought', 'soul',
    'sound', 'sounds', 'source', 'sources', 'south', 'southern', 'space', 'speak', 'speaker',
    'speaking', 'special', 'specific', 'specifically', 'speech', 'speed', 'spend', 'spending',
    'spent', 'spirit', 'spoke', 'spoken', 'sport', 'sports', 'spot', 'spread', 'spring',
    'square', 'staff', 'stage', 'stand', 'standing', 'star', 'stars', 'started', 'starting',
    'stated', 'statement', 'statements', 'states', 'station', 'stay', 'stayed', 'step',
    'steps', 'stick', 'stock', 'stone', 'stood', 'stop', 'stopped', 'store', 'stores',
    'stories', 'story', 'straight', 'strange', 'strategic', 'strategy', 'street', 'streets',
    'strength', 'strike', 'strong', 'strongly', 'structure', 'struggle', 'struck', 'student',
    'students', 'studies', 'study', 'stuff', 'style', 'subject', 'succeed', 'success',
    'successful', 'suddenly', 'suffer', 'suggest', 'suggested', 'suggestion', 'summer',
    'sunday', 'supply', 'support', 'supported', 'supporters', 'supporting', 'supports',
    'suppose', 'supposed', 'sure', 'surface', 'surprise', 'surprised', 'surprising', 'survey',
    'sweet', 'system', 'systems', 'table', 'taken', 'takes', 'taking', 'talk', 'talked',
    'talking', 'tape', 'target', 'task', 'taught', 'taxes', 'teacher', 'teachers', 'teaching',
    'team', 'teams', 'technical', 'technology', 'teeth', 'television', 'temperature', 'tend',
    'term', 'terms', 'terrible', 'terror', 'terrorism', 'terrorist', 'terrorists', 'test',
    'tested', 'testing', 'tests', 'text', 'thank', 'thanks', 'theater', 'themselves', 'theory',
    'thick', 'thin', 'thinking', 'third', 'thirty', 'thousand', 'thousands', 'threat',
    'threatened', 'threw', 'throw', 'thrown', 'thus', 'ticket', 'tied', 'tight', 'till',
    'times', 'tiny', 'title', 'today', 'together', 'tomorrow', 'tone', 'tonight', 'took',
    'tool', 'tools', 'tooth', 'topic', 'total', 'totally', 'touch', 'touched', 'tough',
    'tour', 'toward', 'towards', 'tower', 'town', 'track', 'trade', 'tradition', 'traditional',
    'traffic', 'trail', 'train', 'trained', 'training', 'travel', 'treat', 'treated',
    'treatment', 'tree', 'trees', 'trend', 'trial', 'tried', 'tries', 'trip', 'troops',
    'trouble', 'truck', 'truly', 'trust', 'truth', 'trying', 'tube', 'tuesday', 'turn',
    'turned', 'turning', 'twelve', 'twenty', 'twice', 'type', 'types', 'typical', 'ultimately',
    'unable', 'uncle', 'understand', 'understanding', 'understood', 'unfortunately', 'union',
    'unique', 'unit', 'united', 'units', 'unity', 'universal', 'university', 'unless',
    'unlikely', 'upon', 'upper', 'urban', 'user', 'users', 'using', 'usual', 'usually',
    'valley', 'valuable', 'value', 'values', 'variety', 'version', 'victim', 'victims',
    'victory', 'video', 'view', 'views', 'village', 'violence', 'virtual', 'virtually',
    'vision', 'visit', 'visited', 'visual', 'voice', 'volume', 'vote', 'voted', 'voter',
    'voters', 'votes', 'voting', 'wait', 'waited', 'waiting', 'wake', 'walk', 'walked',
    'walking', 'wall', 'walls', 'wanted', 'wants', 'warm', 'warning', 'wash', 'washington',
    'wasn', 'waste', 'watch', 'watched', 'watching', 'wave', 'ways', 'weak', 'wealth',
    'weapon', 'weapons', 'wear', 'wearing', 'weather', 'website', 'wedding', 'week',
    'weekend', 'weeks', 'weight', 'welcome', 'welfare', 'west', 'western', 'whatever',
    'wheel', 'whenever', 'whereas', 'wherever', 'whether', 'whichever', 'whom', 'whose',
    'wide', 'widely', 'wife', 'wild', 'willing', 'wind', 'window', 'wine', 'wing', 'winner',
    'winter', 'wish', 'within', 'woman', 'women', 'wonder', 'wonderful', 'wondering', 'wood',
    'words', 'worker', 'workers', 'working', 'works', 'workshop', 'worry', 'worse', 'worst',
    'worth', 'wouldn', 'wound', 'writer', 'writers', 'writing', 'written', 'wrong', 'wrote',
    'yard', 'yeah', 'years', 'yellow', 'yesterday', 'york', 'yourself', 'youth', 'zero',
}

# Load words from file if it exists
_word_set = None

def _load_words() -> set:
    """Load English words from file or use fallback."""
    global _word_set
    if _word_set is not None:
        return _word_set

    try:
        if os.path.exists(COMMON_WORDS_FILE):
            with open(COMMON_WORDS_FILE, 'r') as f:
                _word_set = set(word.strip().lower() for word in f if len(word.strip()) >= 4)
        else:
            _word_set = BASIC_COMMON_WORDS
    except Exception:
        _word_set = BASIC_COMMON_WORDS

    return _word_set


def extract_words(text: str) -> List[str]:
    """
    Extract words from text.
    Only returns words with 4+ letters.
    """
    # Remove punctuation and split
    words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
    # Filter to 4+ letter words only
    return [w for w in words if len(w) >= 4]


def is_english_word(word: str) -> bool:
    """Check if a word is in the English lexicon."""
    words = _load_words()
    return word.lower() in words


def validate_deletion_reason(reason: str, min_words: int = 100) -> Tuple[bool, str, dict]:
    """
    Validate deletion reason.

    Requirements:
    - Minimum 100 valid words (4+ letters)
    - Words must be in English lexicon
    - Returns (is_valid, error_message, stats)

    Returns:
        Tuple of (is_valid, error_message, stats_dict)
        stats_dict contains: total_words, valid_words, invalid_words, invalid_word_list
    """
    if not reason or not reason.strip():
        return False, "Deletion reason is required.", {"total_words": 0, "valid_words": 0}

    # Extract words (4+ letters only)
    words = extract_words(reason)
    total_words = len(words)

    if total_words == 0:
        return False, "No valid words found. Words must be 4 or more letters.", {
            "total_words": 0,
            "valid_words": 0,
            "invalid_words": 0,
            "invalid_word_list": []
        }

    # Check each word against lexicon
    valid_words = []
    invalid_words = []

    for word in words:
        if is_english_word(word):
            valid_words.append(word)
        else:
            invalid_words.append(word)

    stats = {
        "total_words": total_words,
        "valid_words": len(valid_words),
        "invalid_words": len(invalid_words),
        "invalid_word_list": invalid_words[:20]  # First 20 invalid words
    }

    # Check minimum word count
    if len(valid_words) < min_words:
        return False, f"Insufficient valid English words. Found {len(valid_words)} valid words, need at least {min_words}.", stats

    # Check invalid word ratio (allow some typos/names - up to 20%)
    if len(invalid_words) > total_words * 0.2:
        return False, f"Too many unrecognized words ({len(invalid_words)} out of {total_words}). Please use proper English words.", stats

    return True, "", stats


def get_word_count_stats(text: str) -> dict:
    """Get word count statistics for a text."""
    words = extract_words(text)
    total = len(words)

    valid = sum(1 for w in words if is_english_word(w))
    invalid = total - valid

    return {
        "total_words_4plus": total,
        "valid_english_words": valid,
        "unrecognized_words": invalid,
        "meets_minimum": valid >= 100
    }
