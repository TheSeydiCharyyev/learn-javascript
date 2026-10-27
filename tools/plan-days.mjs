// Phase 3, step 2: days of a course. Every row of the course modules gets a day and a depth
// ("подробно" or "кратко"); the lesson is 1, because new material is introduced in the lecture.
//
//   node tools/plan-days.mjs 1              load per day; lists rows that no rule matched
//   node tools/plan-days.mjs 1 --list 16    rows of one day
//   node tools/plan-days.mjs 1 --markdown   table for docs/plan-1-essentials.md (course 2: plan-2-intermediate.md,
//                                           course 3: plan-3-advanced.md)
//   node tools/plan-days.mjs 1 --apply      write course, day, lesson and depth into docs/coverage/*.csv
import path from 'node:path';
import { readCsv, writeCsv } from './lib/csv.mjs';
import { MODULES, planRows } from './plan-modules.mjs';

const DIR = path.join(import.meta.dirname, '..', 'docs', 'coverage');

// short key of a row: "Web/JavaScript/Reference/Global_Objects/Array/map" -> "Array/map",
// "Web/API/Element/append" -> "Element/append", "Web/JavaScript" -> "JS root"
export function shortKey(key) {
  for (const p of ['Web/JavaScript/Reference/Global_Objects/', 'Web/JavaScript/Reference/', 'Web/JavaScript/', 'Web/API/']) {
    if (key.startsWith(p)) return key.slice(p.length);
  }
  return key === 'Web/JavaScript' ? 'JS root' : key === 'Web/API' ? 'API root' : key;
}

const DAYS_1 = [
  [1, 'E1', 'Что такое JavaScript и где он работает'],
  [2, 'E1', 'Инструменты: редактор, страница, консоль'],
  [3, 'E1', 'Обзор языка и первая программа'],
  [4, 'E2', 'Переменные: let, const, var'],
  [5, 'E2', 'Типы данных и typeof'],
  [6, 'E2', 'Арифметика и присваивание'],
  [7, 'E2', 'Сравнение и логические операторы'],
  [8, 'E2', 'Преобразование типов и приоритет операторов'],
  [9, 'E3', 'Условия: if, else, switch'],
  [10, 'E3', 'Циклы: for, while, do...while'],
  [11, 'E3', 'Перебор значений: for...of, for...in; try...catch'],
  [12, 'E4', 'Функции: объявление, параметры, return'],
  [13, 'E4', 'Стрелочные функции и функции-выражения'],
  [14, 'E4', 'Параметры по умолчанию и остаточные параметры'],
  [15, 'E4', 'Практика: разбиваем задачу на функции (смешанный день)'],
  [16, 'E5', 'Строки и их методы'],
  [17, 'E5', 'Числа и первые даты: Number, parseInt, Date'],
  [18, 'E5', 'Math и случайные числа'],
  [19, 'E6', 'Массивы: создание и основные методы'],
  [20, 'E6', 'Перебор массивов: forEach, map, filter, reduce'],
  [21, 'E6', 'Объекты: свойства, методы, перебор'],
  [22, 'E6', 'Деструктуризация, spread и необязательная цепочка'],
  [23, 'E6', 'JSON: parse и stringify'],
  [24, 'E7', 'DOM: находим элементы на странице'],
  [25, 'E7', 'Меняем страницу: текст, разметка, атрибуты, классы, стили'],
  [26, 'E7', 'Создаём и удаляем элементы'],
  [27, 'E7', 'События: слушатели, объект события, всплытие'],
  [28, 'E7', 'Формы: поля, отправка, проверка ввода'],
  [29, null, 'Мини-проект: список дел'],
  [30, 'E8', 'Таймеры и промисы'],
  [31, 'E8', 'fetch, async/await и localStorage'],
  [32, null, 'Мини-проект: каталог с данными с сервера'],
  [33, null, 'Итоговый проект: замысел и план'],
  [34, null, 'Итоговый проект: реализация'],
  [35, null, 'Итоговый проект: доработка и проверка'],
  [36, null, 'Защита проектов'],
];

// [day, depth, pattern on the short key]; the first match wins
const RULES_1 = [
  // 1. Что такое JavaScript
  [1, 'подробно', /^Guide\/Introduction$/],
  [1, 'кратко', /^(JS root|Guide|Reference|JavaScript_technologies_overview)$/],
  // 2. Консоль
  [2, 'подробно', /^console(\/(log|error|warn|info|table|dir|time|timeEnd|count|group|groupEnd|clear|assert|trace)_static)?$/],
  [2, 'кратко', /^(console\/|Console_API$|Statements\/debugger$)/],
  // 3. Обзор языка
  [3, 'подробно', /^Guide\/Language_overview$/],
  // 4. Переменные
  [4, 'подробно', /^(Statements\/(let|const|var|block)|Guide\/Grammar_and_types)$/],
  [4, 'кратко', /^(Statements\/(Empty|Expression_statement)|Errors\/(Invalid_const_assignment|Missing_initializer_in_const|Undeclared_var|No_variable_name|Cant_access_lexical_declaration_before_init|Read-only))$/],
  // 5. Типы данных
  [5, 'подробно', /^(Guide\/Data_structures|Operators\/(typeof|null)|undefined|NaN|Boolean)$/],
  [5, 'кратко', /^(Infinity|Boolean\/|Errors\/(Unexpected_type|Not_defined))/],
  // 6. Арифметика
  [6, 'подробно', /^Operators\/(Addition|Subtraction|Multiplication|Division|Remainder|Assignment|Addition_assignment|Increment|Decrement)$/],
  [6, 'кратко', /^(Operators$|Operators\/(Exponentiation|Unary_negation|Unary_plus|(Subtraction|Multiplication|Division|Remainder|Exponentiation)_assignment)$)/],
  // 7. Сравнение и логика
  [7, 'подробно', /^Operators\/(Equality|Inequality|Strict_equality|Strict_inequality|Greater_than|Greater_than_or_equal|Less_than|Less_than_or_equal|Logical_AND|Logical_OR|Logical_NOT|Nullish_coalescing|Conditional_operator)$/],
  [7, 'кратко', /^Operators\/Comma_operator$/],
  // 8. Преобразования и приоритет
  [8, 'подробно', /^(Guide\/Expressions_and_operators|Operators\/(Operator_precedence|Grouping))$/],
  [8, 'кратко', /^Errors\/(Invalid_assignment_left-hand_side|Unexpected_token|Illegal_character|Identifier_after_number|String_literal_EOL|Missing_parenthesis_after_condition|Missing_curly_after_function_body)$/],
  // 9. Условия
  [9, 'подробно', /^(Statements\/(if\.\.\.else|switch)|Guide\/Control_flow_and_error_handling)$/],
  [9, 'кратко', /^Statements$/],
  // 10. Циклы
  [10, 'подробно', /^(Statements\/(for|while|do\.\.\.while|break|continue)|Guide\/Loops_and_iteration)$/],
  [10, 'кратко', /^(Statements\/label|Errors\/(Bad_break|Bad_continue|Label_not_found))$/],
  // 11. Перебор и ошибки
  [11, 'подробно', /^Statements\/(for\.\.\.of|for\.\.\.in|try\.\.\.catch|throw)$/],
  [11, 'кратко', /^Errors\/(is_not_iterable|Invalid_for-in_initializer|Invalid_for-of_initializer)$/],
  // 12. Функции
  [12, 'подробно', /^(Statements\/(function|return)|Functions|Guide\/Functions)$/],
  [12, 'кратко', /^Errors\/(Missing_formal_parameter|Missing_parenthesis_after_argument_list|Stmt_after_return|Unnamed_function_statement|Too_much_recursion|More_arguments_needed|Not_a_function)$/],
  // 13. Стрелочные функции
  [13, 'подробно', /^(Functions\/Arrow_functions|Operators\/function)$/],
  // 14. Параметры
  [14, 'подробно', /^Functions\/(Default_parameters|rest_parameters)$/],
  [14, 'кратко', /^Errors\/(Rest_with_default|Parameter_after_rest_parameter|Duplicate_parameter|Redeclared_parameter)$/],
  // 16. Строки
  [16, 'подробно', /^(String|Template_literals|String\/(length|at|charAt|includes|indexOf|lastIndexOf|slice|substring|startsWith|endsWith|toLowerCase|toUpperCase|trim|trimStart|trimEnd|padStart|padEnd|repeat|concat))$/],
  [16, 'кратко', /^(String\/|Errors\/(Negative_repetition_count|Resulting_string_too_large|Not_a_valid_code_point))/],
  // 17. Числа
  [17, 'подробно', /^(Guide\/Numbers_and_strings|parseInt|parseFloat|isNaN|isFinite|Number|Number\/(Number|isInteger|isNaN|isFinite|parseInt|parseFloat|toFixed|toString|MAX_SAFE_INTEGER))$/],
  [17, 'подробно', /^Date(\/(Date|now|getFullYear|getMonth|getDate|getHours|getMinutes|getTime|toLocaleDateString|toLocaleTimeString))?$/],
  [17, 'кратко', /^(Number\/|Errors\/(Bad_radix|Precision_range|Invalid_date))/],
  // 18. Math
  [18, 'подробно', /^(Math|Math\/(random|round|floor|ceil|abs|max|min|pow|sqrt|trunc|sign|PI))$/],
  [18, 'кратко', /^Math\//],
  // 19. Массивы
  [19, 'подробно', /^(Array|Guide\/Indexed_collections|Array\/(Array|length|push|pop|shift|unshift|slice|splice|indexOf|includes|join|concat|at|reverse|isArray|from|of))$/],
  [19, 'кратко', /^(Array\/(toString|copyWithin|fill|with|toReversed|toSpliced|lastIndexOf)|Errors\/Invalid_array_length)$/],
  // 20. Перебор массивов
  [20, 'подробно', /^Array\/(forEach|map|filter|find|findIndex|reduce|some|every|sort|flat|flatMap)$/],
  [20, 'кратко', /^(Array\/(reduceRight|findLast|findLastIndex|toSorted)|Errors\/(Reduce_of_empty_array_with_no_initial_value|Array_sort_argument))$/],
  // 21. Объекты
  [21, 'подробно', /^(Object|Guide\/Working_with_objects|Object\/(keys|values|entries|assign|hasOwn)|Operators\/(Object_initializer|Property_accessors|delete|in))$/],
  [21, 'кратко', /^(Global_Objects|Object\/(fromEntries|groupBy)|Errors\/(No_properties|Missing_colon_after_property_id|Missing_curly_after_property_list|Cant_assign_to_property|in_operator_no_object|Cant_delete|Missing_name_after_dot_operator|Missing_bracket_after_list|Duplicate_proto))$/],
  // 22. Деструктуризация и spread
  [22, 'подробно', /^Operators\/(Destructuring|Spread_syntax|Optional_chaining)$/],
  // 23. JSON
  [23, 'подробно', /^JSON(\/(parse|stringify))?$/],
  [23, 'кратко', /^Errors\/(JSON_bad_parse|Cyclic_object_value)$/],
  // 24. DOM: поиск
  [24, 'подробно', /^(Document|Document\/(querySelector|querySelectorAll|getElementById|body|title)|Element\/(querySelector|querySelectorAll|closest|matches)|Document_Object_Model|Document_Object_Model\/(Anatomy_of_the_DOM|Selection_and_traversal_on_the_DOM_tree))$/],
  [24, 'кратко', /^(Document\/(getElementsByClassName|getElementsByTagName|head)|NodeList(\/.*)?|Element\/(children|firstElementChild|lastElementChild|nextElementSibling|previousElementSibling)|Node\/(childNodes|firstChild|lastChild|nextSibling|previousSibling|parentNode|parentElement|contains|nodeName|nodeType))$/],
  // 25. DOM: изменение
  [25, 'подробно', /^(Element|Element\/(innerHTML|getAttribute|setAttribute|removeAttribute|hasAttribute|id|className|classList)|DOMTokenList|DOMTokenList\/(add|remove|toggle|contains)|HTMLElement|HTMLElement\/(style|dataset|innerText)|Node\/textContent)$/],
  [25, 'кратко', /^(Element\/(insertAdjacentHTML|scrollIntoView)|DOMTokenList\/replace|HTMLElement\/hidden|Document_Object_Model\/Reflected_attributes)$/],
  // 26. DOM: создание и удаление
  [26, 'подробно', /^(Document\/(createElement|createTextNode)|Element\/(append|prepend|remove|replaceWith)|Node|Node\/(appendChild|removeChild|insertBefore|replaceChild|cloneNode)|Document_Object_Model\/Building_and_updating_the_DOM_tree)$/],
  [26, 'кратко', /^Element\/(before|after)$/],
  // 27. События
  [27, 'подробно', /^(EventTarget|EventTarget\/(addEventListener|removeEventListener)|Event|Event\/(target|currentTarget|type|preventDefault|stopPropagation|bubbles)|Element\/(click_event|keydown_event|keyup_event)|MouseEvent|MouseEvent\/(clientX|clientY|button)|KeyboardEvent|KeyboardEvent\/(key|code)|Document_Object_Model\/Events|Document\/DOMContentLoaded_event)$/],
  [27, 'кратко', /^(EventTarget\/|Event\/|HTMLElement\/(click|focus|blur)|Window\/load_event)/],
  // 28. Формы
  [28, 'подробно', /^(HTMLInputElement|HTMLInputElement\/(value|checked)|HTMLFormElement|HTMLFormElement\/submit_event|HTMLElement\/change_event|Element\/input_event)$/],
  [28, 'кратко', /^(HTMLFormElement\/reset|Window\/(alert|confirm|prompt))$/],
  // 30. Таймеры и промисы
  [30, 'подробно', /^(Window\/(setTimeout|setInterval|clearTimeout|clearInterval)|Guide\/Using_promises|Promise|Promise\/(then|catch|finally|Promise))$/],
  [30, 'кратко', /^Promise\/(resolve|reject)$/],
  // 31. fetch, async/await, localStorage
  [31, 'подробно', /^(Window\/fetch|Fetch_API|Fetch_API\/Using_Fetch|Response|Response\/(json|text|ok|status)|Statements\/async_function|Operators\/await|Storage|Storage\/(getItem|setItem|removeItem|clear)|Web_Storage_API|Web_Storage_API\/Using_the_Web_Storage_API|Window\/(localStorage|sessionStorage)|encodeURIComponent|decodeURIComponent)$/],
  [31, 'кратко', /^(Storage\/(key|length)|encodeURI|decodeURI|Errors\/Malformed_URI)$/],
];

const DAYS_2 = [
  [1, 'I1', 'Области видимости и замыкания'],
  [2, 'I1', 'this: call, apply, bind'],
  [3, 'I1', 'Строгий режим и глобальный объект'],
  [4, 'I1', 'Функция как объект: свойства и arguments'],
  [5, 'I2', 'Свойства изнутри: дескрипторы, геттеры и сеттеры'],
  [6, 'I2', 'Защита объектов, Object.is и логическое присваивание'],
  [7, 'I3', 'Прототипы: цепочка, Object.create, new и instanceof'],
  [8, 'I3', 'Классы: конструктор, методы, поля'],
  [9, 'I3', 'Приватные элементы и static'],
  [10, 'I3', 'Наследование: extends и super'],
  [11, 'I4', 'Символы и протоколы итерации'],
  [12, 'I4', 'Генераторы: function* и yield'],
  [13, 'I4', 'Iterator и его методы'],
  [14, 'I5', 'Map и WeakMap'],
  [15, 'I5', 'Set, WeakSet и операции над множествами'],
  [16, null, 'Мини-проект: журнал группы на классах'],
  [17, 'I6', 'Регулярные выражения: шаблон, флаги, классы, квантификаторы'],
  [18, 'I6', 'Группы и проверки позиции: exec, match, matchAll'],
  [19, 'I6', 'Замена и разбиение: replace, replaceAll, split'],
  [20, 'I6', 'Unicode в строках и регулярных выражениях'],
  [21, 'I7', 'BigInt и Date целиком: разбор строк, UTC, сеттеры'],
  [22, 'I7', 'Temporal: PlainDate, PlainTime, PlainDateTime и Now'],
  [23, 'I7', 'Temporal: Duration, PlainYearMonth, PlainMonthDay'],
  [24, 'I7', 'Temporal: Instant, ZonedDateTime и часовые пояса'],
  [25, 'I7', 'Intl: NumberFormat, DateTimeFormat и локали'],
  [26, 'I8', 'Ошибки: Error, его виды, cause и свои классы ошибок'],
  [27, 'I8', 'Промисы целиком: all, allSettled, any, race, withResolvers, try'],
  [28, 'I8', 'async-функции изнутри и очередь микрозадач'],
  [29, 'I8', 'Асинхронные итераторы и генераторы, for await...of'],
  [30, 'I9', 'Модули: import и export'],
  [31, 'I9', 'Динамический импорт, import.meta и JSON'],
  [32, null, 'Мини-проект: расписание занятий на модулях'],
  [33, null, 'Итоговый проект: замысел и план'],
  [34, null, 'Итоговый проект: реализация'],
  [35, null, 'Итоговый проект: доработка и проверка'],
  [36, null, 'Защита проектов'],
];

// course 2; error pages go to the day where the error first shows up, three of them stay for course 3
const RULES_2 = [
  // 1. Области видимости и замыкания
  [1, 'подробно', /^(Guide\/Closures|sec-environment-records|sec-the-environment-record-type-hierarchy)$/],
  [1, 'кратко', /^sec-environment-record-operations$/],
  // 2. this
  [2, 'подробно', /^(Operators\/this|Function\/(call|apply|bind))$/],
  [2, 'кратко', /^Errors\/Called_on_incompatible_type$/],
  // 3. Строгий режим и глобальный объект
  [3, 'подробно', /^(Strict_mode|globalThis|sec-strict-mode-of-ecmascript)$/],
  [3, 'кратко', /^Errors\/(Bad_strict_arguments_eval|Delete_in_strict_mode|Strict_non_simple_params|Reserved_identifier|Function_label|Deprecated_octal_literal|Deprecated_octal_escape_sequence)$/],
  // 4. Функция как объект
  [4, 'подробно', /^(Function|Function\/(length|name)|Functions\/arguments(\/length)?|sec-function-objects)$/],
  [4, 'кратко', /^(Function\/(Function|prototype|toString)|Functions\/arguments\/Symbol\.iterator|sec-function-constructor|sec-properties-of-the-function-constructor|sec-properties-of-the-function-prototype-object|sec-function-instances|sec-hosthassourcetextavailable|Errors\/(Bad_return|Deprecated_caller_or_arguments_usage))$/],
  // 5. Дескрипторы, геттеры, сеттеры
  [5, 'подробно', /^(Guide\/Enumerability_and_ownership_of_properties|Functions\/(get|set|Method_definitions)|Object\/(defineProperty|getOwnPropertyDescriptor|getOwnPropertyNames|propertyIsEnumerable)|sec-properties-of-the-object-constructor)$/],
  [5, 'кратко', /^(Object\/(defineProperties|getOwnPropertyDescriptors|hasOwnProperty)|sec-object-objects|sec-object-constructor|Errors\/(Getter_no_arguments|Setter_one_argument|Getter_only|Cant_redefine_property|No_non-null_object))$/],
  // 6. Защита объектов, сравнение, логическое присваивание
  [6, 'подробно', /^(Object\/(freeze|isFrozen|seal|isSealed|preventExtensions|isExtensible|is)|Guide\/Equality_comparisons_and_sameness|Operators\/(Logical_AND_assignment|Logical_OR_assignment|Nullish_coalescing_assignment))$/],
  [6, 'кратко', /^(Object\/(Object|toString|toLocaleString|valueOf)|sec-properties-of-the-object-prototype-object|sec-properties-of-object-instances|Errors\/(Cant_define_property_object_not_extensible|Non_configurable_array_element|Cant_use_nullish_coalescing_unparenthesized|Unparenthesized_unary_expr_lhs_exponentiation))$/],
  // 7. Прототипы
  [7, 'подробно', /^(Guide\/Inheritance_and_the_prototype_chain|Object\/(create|getPrototypeOf|setPrototypeOf|isPrototypeOf|constructor)|Operators\/(new|instanceof))$/],
  [7, 'кратко', /^(Object\/proto|Errors\/(Cant_set_prototype|Cyclic_prototype|Not_a_constructor|Bad_new_optional|invalid_right_hand_side_instanceof_operand))$/],
  // 8. Классы
  [8, 'подробно', /^(Guide\/Using_classes|Classes|Classes\/(constructor|Public_class_fields)|Statements\/class|Operators\/class)$/],
  [8, 'кратко', /^Errors\/(Class_ctor_no_new|Arguments_not_allowed)$/],
  // 9. Приватные элементы и static
  [9, 'подробно', /^(Classes\/(Private_elements|static|Static_initialization_blocks)|sec-privateenvironment-records)$/],
  [9, 'кратко', /^(sec-privateenvironment-record-operations|Errors\/(Cant_delete_private_fields|Either_be_both_static_or_non-static|Get_set_missing_private|Hash_outside_class|Private_double_initialization|Private_setter_only|Undeclared_private_field_or_method))$/],
  // 10. Наследование
  [10, 'подробно', /^(Classes\/extends|Operators\/(super|new\.target))$/],
  [10, 'кратко', /^Errors\/(Bad_super_call|Bad_super_prop|Super_called_twice|Super_not_called|Invalid_derived_return)$/],
  // 11. Символы и протоколы итерации
  [11, 'подробно', /^(Symbol|Symbol\/(Symbol|description|iterator)|Iteration_protocols|Array\/(Symbol\.iterator|keys|values|entries)|sec-common-iteration-interfaces)$/],
  [11, 'кратко', /^(Symbol\/(for|keyFor|toString|valueOf)|String\/Symbol\.iterator|Object\/getOwnPropertySymbols|sec-iteration)$/],
  // 12. Генераторы
  [12, 'подробно', /^(Guide\/Iterators_and_generators|Statements\/function\*|Operators\/(function\*|yield|yield\*)|Generator|Generator\/(next|return|throw)|sec-generator-objects)$/],
  [12, 'кратко', /^(GeneratorFunction(\/.*)?|sec-generatorfunction-.*|sec-properties-of-the-generatorfunction-.*|sec-properties-of-generator-.*|sec-generator-abstract-operations|Errors\/(Already_executing_generator|await_yield_in_parameter))$/],
  // 13. Iterator и его методы
  [13, 'подробно', /^(Iterator|Iterator\/(from|map|filter|take|drop|flatMap|reduce|toArray|forEach|some|every|find)|sec-iterator-objects)$/],
  [13, 'кратко', /^(Iterator\/(Iterator|Symbol\.iterator|Symbol\.dispose|concat|zip|zipKeyed|includes|join|chunks|windows)|sec-iterator-helper-objects|Errors\/Constructor_cant_be_used_directly)$/],
  // 14. Map и WeakMap
  [14, 'подробно', /^(Guide\/Keyed_collections|Map|Map\/(Map|set|get|has|delete|size|clear|forEach|keys|values|entries|Symbol\.iterator|groupBy)|WeakMap|WeakMap\/(WeakMap|set|get|has|delete)|sec-map-objects)$/],
  [14, 'кратко', /^(Map\/(getOrInsert|getOrInsertComputed|Symbol\.species)|WeakMap\/(getOrInsert|getOrInsertComputed)|sec-keyed-collections|sec-map-.*|sec-properties-of-(the-)?map-.*|sec-weakmap-.*|sec-properties-of-(the-)?weakmap-.*|sec-abstract-operations-for-keyed-collections|sec-canonicalizekeyedcollectionkey|Errors\/(Key_not_weakly_held|Builtin_ctor_no_new))$/],
  // 15. Set, WeakSet
  [15, 'подробно', /^(Set|Set\/(Set|add|has|delete|size|clear|forEach|union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)|WeakSet|WeakSet\/(WeakSet|add|has|delete)|sec-set-objects)$/],
  [15, 'кратко', /^(Set\/(keys|values|entries|Symbol\.iterator|Symbol\.species)|sec-set-.*|sec-abstract-operations-for-set-objects|sec-properties-of-(the-)?set-.*|sec-weakset-.*|sec-properties-of-(the-)?weakset-.*|sec-array-objects|sec-array-.*|sec-properties-of-(the-)?array-.*)$/],
  // 17. Регулярные выражения: основы
  [17, 'подробно', /^(Guide\/Regular_expressions|Guide\/Regular_expressions\/(Cheatsheet|Character_classes|Quantifiers)|Regular_expressions|Regular_expressions\/(Literal_character|Character_escape|Character_class|Character_class_escape|Wildcard|Quantifier|Disjunction)|RegExp|RegExp\/(RegExp|test|flags|global|ignoreCase)|String\/search|sec-regexp-regular-expression-objects)$/],
  [17, 'кратко', /^(RegExp\/(source|toString)|sec-patterns|sec-regexp-constructor|sec-abstract-operations-for-regexp-creation|Errors\/(Bad_regexp_flag|Regex_backslash_at_end_of_pattern|Regex_nothing_to_repeat|Regex_numbers_out_of_order_in_quantifier|Regex_invalid_range_in_character_class))$/],
  // 18. Группы и проверки позиции
  [18, 'подробно', /^(Guide\/Regular_expressions\/(Assertions|Groups_and_backreferences)|Regular_expressions\/(Input_boundary_assertion|Word_boundary_assertion|Capturing_group|Named_capturing_group|Non-capturing_group|Backreference|Named_backreference|Lookahead_assertion|Lookbehind_assertion)|RegExp\/(exec|lastIndex|multiline)|String\/(match|matchAll)|sec-abstract-operations-for-regexp-matching)$/],
  [18, 'кратко', /^(Regular_expressions\/(Buffer_boundary_assertion|Modifier)|RegExp\/(sticky|dotAll|hasIndices)|sec-pattern-semantics|sec-properties-of-regexp-instances|sec-regexp-string-iterator-objects|Errors\/(Regex_invalid_group|Regex_invalid_capture_group_name|Regex_duplicate_capture_group_name|Regex_invalid_named_capture_reference|Requires_global_RegExp))$/],
  // 19. Замена и разбиение
  [19, 'подробно', /^(String\/(replace|replaceAll|split)|RegExp\/escape)$/],
  [19, 'кратко', /^(RegExp\/Symbol\.(match|matchAll|replace|search|split|species)|sec-properties-of-the-regexp-prototype-object|sec-properties-of-the-regexp-constructor)$/],
  // 20. Unicode
  [20, 'подробно', /^(Regular_expressions\/Unicode_character_class_escape|RegExp\/(unicode|unicodeSets)|String\/(raw|isWellFormed|toWellFormed|normalize)|sec-string-objects)$/],
  [20, 'кратко', /^(sec-text-processing|sec-string-.*|sec-properties-of-(the-)?string-.*|Errors\/(Regex_incomplete_quantifier|Regex_invalid_char_in_class|Regex_character_class_escape_in_class_range|Regex_invalid_identity_escape|Regex_raw_bracket|Regex_invalid_decimal_escape|Regex_invalid_unicode_escape|Regex_invalid_property_name|Regex_negated_char_class_with_strings|Regex_invalid_class_set_operation|Bad_optional_template|Form_must_be_one_of))$/],
  // 21. BigInt и Date
  [21, 'подробно', /^(BigInt|BigInt\/(BigInt|toString)|Guide\/Representing_dates_times|Date\/(parse|UTC|toISOString|getDay|getSeconds|getMilliseconds|getTimezoneOffset|setFullYear|setMonth|setDate|setHours|setMinutes|setSeconds))$/],
  [21, 'кратко', /^(BigInt\/(asIntN|asUintN|valueOf)|Date\/(getUTC\w+|setUTC\w+|setMilliseconds|setTime|Symbol\.toPrimitive|toDateString|toTimeString|toUTCString|toString|valueOf|toJSON)|Errors\/(BigInt_division_by_zero|BigInt_negative_exponent|Cant_be_converted_to_BigInt_because_it_isnt_an_integer|Cant_convert_BigInt_to_number|Cant_convert_x_to_BigInt|Invalid_BigInt_syntax))$/],
  // 22. Temporal: Plain* и Now (подробно — PlainDate; у PlainTime и PlainDateTime те же методы, они кратко)
  [22, 'подробно', /^(Temporal|Temporal\/Now|Temporal\/Now\/plainDateISO|Temporal\/PlainDate|Temporal\/PlainDate\/(PlainDate|from|add|subtract|since|until|with|equals|compare|toString|year|month|day|dayOfWeek|daysInMonth|toPlainDateTime)|Temporal\/PlainTime|Temporal\/PlainTime\/(PlainTime|from|hour|minute)|Temporal\/PlainDateTime|Temporal\/PlainDateTime\/(PlainDateTime|from|toPlainDate|toPlainTime))$/],
  [22, 'кратко', /^(Temporal\/Now\/(plainDateTimeISO|plainTimeISO|instant|timeZoneId|zonedDateTimeISO)|Temporal\/(PlainDate|PlainTime|PlainDateTime)\/.*)$/],
  // 23. Temporal: Duration, PlainYearMonth, PlainMonthDay
  [23, 'подробно', /^(Temporal\/Duration|Temporal\/Duration\/(Duration|from|total|round|toString|with)|Temporal\/(PlainYearMonth|PlainMonthDay)|Temporal\/PlainYearMonth\/(PlainYearMonth|from|toPlainDate)|Temporal\/PlainMonthDay\/(PlainMonthDay|from|toPlainDate))$/],
  [23, 'кратко', /^Temporal\/(Duration|PlainYearMonth|PlainMonthDay)\/.*$/],
  // 24. Temporal: Instant, ZonedDateTime; мост из Date
  [24, 'подробно', /^(Date\/toTemporalInstant|Temporal\/(Instant|ZonedDateTime)|Temporal\/Instant\/(Instant|from|fromEpochMilliseconds|epochMilliseconds|toZonedDateTimeISO)|Temporal\/ZonedDateTime\/(ZonedDateTime|from|timeZoneId|offset|withTimeZone|startOfDay|hoursInDay|toInstant|toPlainDate|add))$/],
  [24, 'кратко', /^Temporal\/(Instant|ZonedDateTime)\/.*$/],
  // 25. Intl
  [25, 'подробно', /^(Guide\/Internationalization|Intl\/(NumberFormat|DateTimeFormat)|Intl\/(NumberFormat|DateTimeFormat)\/(NumberFormat|DateTimeFormat|format|formatToParts|resolvedOptions)|Number\/toLocaleString|Date\/toLocaleString|String\/localeCompare|sec-intl-(numberformat|datetimeformat)-constructor)$/],
  [25, 'кратко', /^(Intl\/(NumberFormat|DateTimeFormat)\/.*|Array\/toLocaleString|BigInt\/toLocaleString|String\/(toLocaleLowerCase|toLocaleUpperCase))$/],
  // ECMA-402, главы 11 (DateTimeFormat) и 16 (NumberFormat): id разделов разного вида, ловим по общим словам
  [25, 'кратко', /^((datetimeformat|numberformat)-objects|sec-.*(datetime|date-time|numberformat|number-format|formatnumber|formatnumeric|numberpattern|notationsubpattern|numberrangepattern|formatmatcher|tolocaltime|offsettimezone|currencydigits|torawprecision|torawfixed|computeexponent|stringintlmv|tointlmathematicalvalue|unsignedroundingmode|formatapproximately|collapsenumberrange).*)$/i],
  // 26. Ошибки
  [26, 'подробно', /^(Errors|Error|Error\/(Error|message|name|cause|isError)|(TypeError|RangeError|SyntaxError|ReferenceError)|sec-error-objects)$/],
  [26, 'кратко', /^(Error\/(stack|captureStackTrace|stackTraceLimit|toString|columnNumber|fileName|lineNumber)|(TypeError|RangeError|SyntaxError|ReferenceError)\/\w+|(EvalError|URIError|InternalError)(\/\w+)?|sec-error-constructor|sec-properties-of-(the-)?error-.*|sec-native-error-types-used-in-this-standard|sec-nativeerror-object-structure|sec-abstract-operations-for-error-objects)$/],
  // 27. Промисы целиком
  [27, 'подробно', /^(Promise\/(all|allSettled|any|race|withResolvers|try)|AggregateError|AggregateError\/errors|sec-promise-objects)$/],
  [27, 'кратко', /^(Promise\/(allKeyed|allSettledKeyed|Symbol\.species)|AggregateError\/AggregateError|sec-aggregate-error-objects|sec-control-abstraction-objects|sec-promise-abstract-operations|sec-promise-constructor|sec-properties-of-the-promise-.*|sec-properties-of-promise-instances|Errors\/Promise_any_all_rejected)$/],
  // 28. async-функции изнутри
  [28, 'подробно', /^(Operators\/async_function|sec-promise-jobs)$/],
  [28, 'кратко', /^(AsyncFunction(\/AsyncFunction)?|sec-async-function-.*|sec-async-functions-abstract-operations|Errors\/Bad_await)$/],
  // 29. Асинхронные итераторы и генераторы
  [29, 'подробно', /^(Statements\/(async_function\*|for-await\.\.\.of)|Operators\/async_function\*|AsyncGenerator|AsyncGenerator\/next|Symbol\/asyncIterator|AsyncIterator|Array\/fromAsync|sec-asyncgenerator-objects)$/],
  [29, 'кратко', /^(AsyncGenerator\/(return|throw)|AsyncGeneratorFunction(\/.*)?|AsyncIterator\/.*|sec-asyncgeneratorfunction-.*|sec-properties-of-asyncgenerator.*|sec-asyncgenerator-abstract-operations|sec-asynciteratorprototype|sec-async-from-sync-iterator-objects)$/],
  // 30. Модули
  [30, 'подробно', /^(Guide\/Modules|Statements\/(import|export))$/],
  [30, 'кратко', /^Errors\/import_decl_module_top_level$/],
  // 31. Динамический импорт, import.meta, JSON
  [31, 'подробно', /^(Operators\/(import|import\.meta)|Statements\/import\/with|sec-json\.parse|sec-json\.stringify)$/],
  [31, 'кратко', /^(Operators\/import\.meta\/resolve|JSON\/(rawJSON|isRawJSON)|sec-json-object|sec-json\.israwjson|sec-json\.rawjson|sec-json-%symbol\.tostringtag%|Errors\/BigInt_not_serializable)$/],
];

const DAYS_3 = [
  [1, 'A1', 'Как устроена спецификация: обзор, термины, соглашения об алгоритмах'],
  [2, 'A1', 'Грамматики и исходный текст: пробелы, переводы строк, комментарии, имена'],
  [3, 'A1', 'Литералы, автоматическая вставка точки с запятой и висячие запятые'],
  [4, 'A2', 'Типы языка и типы спецификации: Completion Record и Reference Record'],
  [5, 'A2', 'Преобразования и сравнения: ToPrimitive, ToNumber, IsLooselyEqual'],
  [6, 'A2', 'Числа как биты: побитовые операторы, ToInt32 и void'],
  [7, 'A2', 'Операции над объектами и итераторами: Get, Set, Call, Construct'],
  [8, 'A3', 'Синтаксически управляемые операции: Evaluation и объявленные имена'],
  [9, 'A3', 'Контексты выполнения, реалмы, задания и агенты'],
  [10, 'A3', 'Выражения по спецификации'],
  [11, 'A3', 'Инструкции и объявления по спецификации'],
  [12, 'A3', 'Функции и классы по спецификации'],
  [13, 'A3', 'Скрипты и модули изнутри, eval'],
  [14, 'A4', 'Внутренние методы обычных объектов и функций'],
  [15, 'A4', 'Экзотические объекты: массив, строка, arguments, связанная функция'],
  [16, 'A4', 'Proxy: ловушки и инварианты'],
  [17, 'A4', 'Reflect и встроенные символы'],
  [18, 'A4', 'Глобальный объект и стандартные встроенные объекты'],
  [19, null, 'Мини-проект после модулей A1–A4'],
  [20, 'A5', 'ArrayBuffer и типизированные массивы'],
  [21, 'A5', 'DataView, порядок байтов, Float16 и base64'],
  [22, 'A5', 'SharedArrayBuffer и Atomics'],
  [23, 'A5', 'Модель памяти: гонки данных и happens-before'],
  [24, 'A6', 'WeakRef и FinalizationRegistry: сборка мусора'],
  [25, 'A6', 'using, await using и DisposableStack'],
  [26, 'A7', 'ECMA-402 изнутри: языковые теги и согласование локалей'],
  [27, 'A7', 'Intl.Locale и Intl.Collator'],
  [28, 'A7', 'PluralRules, ListFormat и RelativeTimeFormat'],
  [29, 'A7', 'DisplayNames, DurationFormat и Segmenter'],
  [30, 'A7', 'Числа и даты по спецификации, функции, зависящие от локали'],
  [31, 'A8', 'Наследие и совместимость: приложение B, with, устаревшие методы'],
  [32, null, 'Мини-проект после модулей A5–A8'],
  [33, null, 'Итоговый проект: замысел и план'],
  [34, null, 'Итоговый проект: реализация'],
  [35, null, 'Итоговый проект: доработка и проверка'],
  [36, null, 'Защита проектов'],
];

// course 3: most rows are spec sections, so a rule may also match the section number ('262:9.4.2', '402:15.1');
// the first match wins, so rows that move to a day of another module come first
const RULES_3 = [
  // переносы между модулями: спецификация операторов — к побитовым операторам, eval — к скриптам,
  // TypedArray exotic — к типизированным массивам, сборка мусора и Symbol.dispose — в A6, with — в A8
  [6, 'подробно', /^262:(13\.9|13\.12)$/],
  [6, 'кратко', /^262:(13\.5\.[26]|13\.9\.[1-3]|13\.12\.1)$/],
  [13, 'подробно', /^262:19\.2\.1$/],
  [20, 'подробно', /^262:10\.4\.5$/],
  [24, 'подробно', /^Guide\/Memory_management$/],
  [25, 'подробно', /^Symbol\/dispose$/],
  [25, 'кратко', /^Symbol\/asyncDispose$/],
  [31, 'подробно', /^262:14\.11$/],
  [31, 'кратко', /^262:14\.11\.[12]$/],
  // 1. Как устроена спецификация
  [1, 'подробно', /^262:(4\.[23]|5\.2(\.[1-5])?)$/],
  [1, 'кратко', /^262:([1-4](\..*)?|5|5\.2\.\d+)$/],
  // 2. Грамматики и исходный текст
  [2, 'подробно', /^(Lexical_grammar|262:(5\.1(\.[125])?|11\.1|11\.2|12\.[2347]))$/],
  [2, 'кратко', /^262:(5\.1\.\d|11(\.\d(\.\d)?)?|12(\.[1-8](\.\d)?)?)$/],
  // 3. Литералы, вставка точки с запятой, висячие запятые
  [3, 'подробно', /^(Trailing_commas|262:(12\.9\.[346]|12\.10(\.[13])?))$/],
  [3, 'кратко', /^262:(12\.9(\.\d)?|12\.10\.\d|A(\.\d)?)$/],
  // 4. Типы языка и типы спецификации
  [4, 'подробно', /^262:(6|6\.1|6\.1\.[67]|6\.2|6\.2\.[245])$/],
  [4, 'кратко', /^262:6\.[12]\.\d+$/],
  // 5. Преобразования и сравнения
  [5, 'подробно', /^262:(7\.1|7\.1\.(1|2|4|17|18|19)|7\.2|7\.2\.(9|12|13|14))$/],
  [5, 'кратко', /^262:(7|7\.1\.(3|5|13|14|20|21|22)|7\.2\.\d+)$/],
  // 6. Числа как биты
  [6, 'подробно', /^(Operators\/(Bitwise_(AND|OR|XOR|NOT)|Left_shift|Right_shift|Unsigned_right_shift|void)|262:7\.1\.[67])$/],
  [6, 'кратко', /^(Operators\/(Bitwise_(AND|OR|XOR)|Left_shift|Right_shift|Unsigned_right_shift)_assignment|262:7\.1\.(8|9|10|11|12|15|16))$/],
  // 7. Операции над объектами и итераторами
  [7, 'подробно', /^262:(7\.3|7\.3\.(2|4|13|14)|7\.4|7\.4\.1)$/],
  [7, 'кратко', /^262:7\.[34]\.\d+$/],
  // 8. Синтаксически управляемые операции
  [8, 'подробно', /^262:(8|8\.1|8\.2|8\.2\.[146]|8\.4|8\.4\.5)$/],
  [8, 'кратко', /^262:8\.\d(\.\d+)?$/],
  // 9. Контексты выполнения, реалмы, задания, агенты
  [9, 'подробно', /^(Execution_model|262:(9\.3|9\.4|9\.4\.[24]|9\.5|9\.6))$/],
  [9, 'кратко', /^(Errors\/Property_access_denied|262:(9|9\.[3-8](\.\d)?))$/],
  // 10. Выражения
  [10, 'подробно', /^262:(13\.3\.2|13\.3\.6|13\.3\.9|13\.5\.1|13\.5\.3|13\.8\.1|13\.10\.2|13\.15\.2|13\.15\.5)$/],
  [10, 'кратко', /^262:13(\.\d+(\.\d+)?)?$/],
  // 11. Инструкции и объявления
  [11, 'подробно', /^262:(14\.2\.3|14\.3\.[12]|14\.7\.[45]|14\.15|14\.15\.3)$/],
  [11, 'кратко', /^262:14(\.\d+(\.\d+)?)?$/],
  // 12. Функции и классы
  [12, 'подробно', /^262:(15\.1|15\.2|15\.2\.4|15\.3|15\.7|15\.7\.14|15\.10)$/],
  [12, 'кратко', /^262:15(\.\d+(\.\d+)?)?$/],
  // 13. Скрипты и модули, eval; import defer и import source в Chrome 156 нет
  [13, 'подробно', /^(eval|262:(16\.1|16\.1\.7|16\.2|16\.2\.1))$/],
  [13, 'кратко', /^(AbstractModuleSource|(Operators|Statements)\/import\/(defer|source)|262:16(\.\d(\.\d)?)?)$/],
  // 14. Внутренние методы обычных объектов и функций
  [14, 'подробно', /^262:(10|10\.1|10\.1\.([5689]|11)|10\.2|10\.2\.(1|2|11))$/],
  [14, 'кратко', /^262:(10\.3|10\.[123]\.\d+)$/],
  // 15. Экзотические объекты
  [15, 'подробно', /^262:(10\.4|10\.4\.[1-4])$/],
  [15, 'кратко', /^262:(10\.4\.[67]|28\.3(\.1)?)$/],
  // 16. Proxy
  [16, 'подробно', /^(Guide\/Meta_programming|Proxy|Proxy\/(Proxy|revocable)|Proxy\/Proxy\/(get|set|has|deleteProperty|apply|construct|ownKeys)|262:(10\.5|10\.5\.(8|15)|28\.2))$/],
  [16, 'кратко', /^(Proxy\/Proxy\/\w+|262:(10\.5\.\d+|28\.2\.\d))$/],
  // 17. Reflect и встроенные символы
  [17, 'подробно', /^(Reflect|Reflect\/(apply|construct|get|set|ownKeys|defineProperty)|Symbol\/(toPrimitive|toStringTag|species|hasInstance)|262:28\.1)$/],
  [17, 'кратко', /^(Reflect\/\w+|Symbol\/(isConcatSpreadable|match|matchAll|replace|search|split|Symbol\.toPrimitive|unscopables)|Array\/Symbol\.(species|unscopables)|Function\/Symbol\.hasInstance|262:(28|28\.1\.\d+|20\.4(\.\d)?))$/],
  // 18. Глобальный объект и стандартные встроенные объекты
  [18, 'подробно', /^262:(18|19|19\.[12]|19\.2\.[56])$/],
  [18, 'кратко', /^262:(17(\.1)?|19\.[1-4](\.\d+)?|20|20\.3(\.\d)?)$/],
  // 20. ArrayBuffer и типизированные массивы
  [20, 'подробно', /^(Guide\/Typed_arrays|ArrayBuffer|ArrayBuffer\/(ArrayBuffer|resize|transfer|slice)|TypedArray|TypedArray\/(set|subarray|from|buffer)|Uint8Array|Uint8Array\/Uint8Array|262:(23\.2|25\.1|25\.1\.2))$/],
  [20, 'кратко', /^(ArrayBuffer\/[\w.]+|TypedArray\/[\w.]+|(Big(Int|Uint)64|Int(8|16|32)|Uint(16|32)|Uint8Clamped|Float(32|64))Array(\/\w+)?|262:(23|23\.2\.\d|25|25\.1\.\d))$/],
  // 21. DataView, порядок байтов, Float16, base64
  [21, 'подробно', /^(DataView|DataView\/(DataView|getUint16|setUint16|getFloat32|setFloat32)|Float16Array|Uint8Array\/(toBase64|fromBase64)|262:(25\.3|23\.3))$/],
  [21, 'кратко', /^(DataView\/\w+|Float16Array\/\w+|Uint8Array\/\w+|262:(25\.3\.\d|23\.3\.\d))$/],
  // 22. SharedArrayBuffer и Atomics (только при crossOriginIsolated)
  [22, 'подробно', /^(SharedArrayBuffer|SharedArrayBuffer\/SharedArrayBuffer|Atomics|Atomics\/(add|load|store|compareExchange|wait|waitAsync|notify)|262:(25\.2|25\.4))$/],
  [22, 'кратко', /^(SharedArrayBuffer\/[\w.]+|Atomics\/\w+|262:(25\.2\.\d|25\.4\.\d+))$/],
  // 23. Модель памяти
  [23, 'подробно', /^262:(29|29\.1|29\.6\.6|29\.8|29\.9|29\.10|29\.11)$/],
  [23, 'кратко', /^262:29\.\d+(\.\d)?$/],
  // 24. WeakRef и FinalizationRegistry
  [24, 'подробно', /^(WeakRef|WeakRef\/deref|FinalizationRegistry|FinalizationRegistry\/register|262:(9\.9|9\.9\.2|26\.1|26\.2))$/],
  [24, 'кратко', /^(WeakRef\/\w+|FinalizationRegistry\/\w+|262:(9\.9\.\d|9\.1[0-3]|26|26\.[12]\.\d))$/],
  // 25. using и DisposableStack (в ECMA-262 2026 их нет)
  [25, 'подробно', /^(Guide\/Resource_management|Statements\/(using|await_using)|DisposableStack|DisposableStack\/(use|defer|dispose)|SuppressedError)$/],
  [25, 'кратко', /^((Async)?DisposableStack(\/[\w.]+)?|SuppressedError\/\w+)$/],
  // 26. ECMA-402: главы 1–9
  [26, 'подробно', /^(Intl|Intl\/(getCanonicalLocales|supportedValuesOf)|402:(4\.2|6\.2|8|9\.1|9\.2))$/],
  [26, 'кратко', /^402:[1-9](\.\d+)*$/],
  // 27. Intl.Locale и Intl.Collator
  [27, 'подробно', /^(Intl\/Locale|Intl\/Locale\/(Locale|maximize|minimize|baseName|getWeekInfo)|Intl\/Collator|Intl\/Collator\/(Collator|compare)|402:(15\.1|10\.1|10\.3))$/],
  [27, 'кратко', /^(Intl\/(Locale|Collator)\/\w+|402:(10|15)(\.\d+)*)$/],
  // 28. PluralRules, ListFormat, RelativeTimeFormat
  [28, 'подробно', /^(Intl\/(PluralRules|ListFormat|RelativeTimeFormat)|Intl\/PluralRules\/(PluralRules|select)|Intl\/ListFormat\/(ListFormat|format)|Intl\/RelativeTimeFormat\/(RelativeTimeFormat|format)|402:(17\.1|14\.1|18\.1))$/],
  [28, 'кратко', /^(Intl\/(PluralRules|ListFormat|RelativeTimeFormat)\/\w+|402:(14|17|18)(\.\d+)*)$/],
  // 29. DisplayNames, DurationFormat, Segmenter
  [29, 'подробно', /^(Intl\/(DisplayNames|DurationFormat|Segmenter)|Intl\/DisplayNames\/(DisplayNames|of)|Intl\/DurationFormat\/(DurationFormat|format)|Intl\/Segmenter\/(Segmenter|segment)|Intl\/Segmenter\/segment\/Segments|402:(12\.1|13\.1|19\.1|19\.5))$/],
  [29, 'кратко', /^(Intl\/(DisplayNames|DurationFormat|Segmenter)\/[\w./]+|402:(12|13|19)(\.\d+)*)$/],
  // 30. Числа и даты по ECMA-262, функции ECMA-402, зависящие от локали
  [30, 'подробно', /^(262:(21\.1|21\.3|21\.4\.1)|402:20)$/],
  [30, 'кратко', /^(262:21(\.\d(\.\d)?)?|402:(20(\.\d+)+|[ABC]))$/],
  // 31. Наследие и совместимость; две страницы ошибок source map
  [31, 'подробно', /^(Deprecated_and_obsolete_features|Statements\/with|262:(B|B\.1\.1|B\.3\.2|B\.3\.6))$/],
  [31, 'кратко', /^(Functions\/arguments\/callee|Date\/(getYear|setYear)|escape|unescape|Function\/(arguments|caller|displayName)|Object\/__(define|lookup)(G|S)etter__|RegExp\/(compile|input|lastMatch|lastParen|leftContext|n|rightContext)|String\/(anchor|big|blink|bold|fixed|fontcolor|fontsize|italics|link|small|strike|sub|substr|sup)|Errors\/(Already_has_pragma|Deprecated_source_map_pragma)|262:(B\.\d(\.\d)?|[DEF](\.\d)?))$/],
];

export const PLAN = {
  1: { course: 'Essentials', days: DAYS_1, rules: RULES_1 },
  2: { course: 'Intermediate', days: DAYS_2, rules: RULES_2 },
  3: { course: 'Advanced', days: DAYS_3, rules: RULES_3 },
};

// a rule tests the short key; a spec row is also tested by its number: '262:9.4.2', '402:15.1'
const ruleKeys = (r) => (r.map.startsWith('ecma') ? [shortKey(r.key), `${r.map.slice(4)}:${r.title.split(' ')[0]}`] : [shortKey(r.key)]);

export function assign(courseNo) {
  const plan = PLAN[courseNo];
  if (!plan) throw new Error(`no day plan for course ${courseNo}`);
  const modules = new Set(MODULES.filter((m) => m[1] === courseNo).map((m) => m[0]));
  const rows = planRows().filter((r) => modules.has(r.module) || r.module === 'ERRORS');
  const out = [], missed = [];
  for (const r of rows) {
    const rule = plan.rules.find(([, , re]) => ruleKeys(r).some((k) => re.test(k)));
    if (rule) out.push({ ...r, day: rule[0], depth: rule[1] });
    else if (r.module !== 'ERRORS') missed.push(r);
  }
  return { plan, rows: out, missed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const courseNo = Number(args[0]);
  const { plan, rows, missed } = assign(courseNo);
  const ofDay = (d) => rows.filter((r) => r.day === d);

  if (args.includes('--list')) {
    const d = Number(args[args.indexOf('--list') + 1]);
    for (const r of ofDay(d)) console.log(`${r.depth.padEnd(9)} ${shortKey(r.key)}`);
  } else if (args.includes('--markdown')) {
    console.log('| День | Модуль | Тема | Подробно | Кратко |\n|---|---|---|---|---|');
    for (const [day, module, title] of plan.days) {
      const d = ofDay(day);
      const full = d.filter((r) => r.depth === 'подробно').length, brief = d.length - full;
      console.log(`| ${day} | ${module ?? 'проект'} | ${title} | ${full || ''} | ${brief || ''} |`);
    }
    console.log(`| | | **Итого** | **${rows.filter((r) => r.depth === 'подробно').length}** | **${rows.filter((r) => r.depth === 'кратко').length}** |`);
  } else if (args.includes('--apply')) {
    const byMap = {};
    for (const r of rows) (byMap[r.map] ??= new Map()).set(r.key, r);
    for (const [map, assigned] of Object.entries(byMap)) {
      const file = path.join(DIR, `${map}.csv`);
      const csv = readCsv(file);
      const keyCol = map.startsWith('mdn') ? 'path' : 'id';
      let n = 0;
      for (const row of csv.records) {
        const a = assigned.get(row[keyCol]);
        if (!a) continue;
        Object.assign(row, { course: String(courseNo), day: String(a.day), lesson: '1', depth: a.depth });
        n++;
      }
      writeCsv(file, csv.header, csv.records);
      console.log(`${map}.csv: ${n} rows assigned to course ${courseNo}`);
    }
  } else {
    console.log(`course ${courseNo} (${plan.course}): ${rows.length} rows on ${plan.days.filter((d) => d[1]).length} study days`);
    for (const [day, module, title] of plan.days) {
      const d = ofDay(day);
      const full = d.filter((r) => r.depth === 'подробно').length;
      console.log(`  ${String(day).padStart(2)} ${(module ?? '--').padEnd(3)} ${String(d.length).padStart(3)} rows (${full} подробно)  ${title}`);
    }
    console.log(`rows without a day: ${missed.length}`);
    for (const r of missed.slice(0, 40)) console.log(`   ${r.module} ${shortKey(r.key)}`);
    process.exit(missed.length ? 1 : 0);
  }
}
