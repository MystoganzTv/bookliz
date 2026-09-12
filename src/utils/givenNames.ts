/**
 * Common given names, used to tell an author query from a title query.
 *
 * The problem this solves: "Rebecca Yarros" and "Fourth Wing" are both two
 * capitalized, letter-only words. Nothing about their *shape* separates them.
 * The old classifier looked only at shape, decided both were names, and ran an
 * `inauthor:` search for the title — so searching "Dune" returned the works of
 * an author surnamed Dune, and "Fourth Wing" returned a crochet book.
 *
 * What actually separates them is vocabulary, not shape. Titles draw on the
 * open vocabulary of the language; given names come from a small, slow-moving
 * closed set. So we check the first word against that set instead of guessing
 * from capitalization.
 *
 * This list does not need to be exhaustive, and deliberately is not. A name it
 * misses costs a general search for an author — which still finds the author,
 * because a free-text query for "Ayn Rand" returns her books. The asymmetry is
 * the whole design: guessing "title" when it was an author is a mild loss,
 * guessing "author" when it was a title is a wrong answer. When in doubt the
 * classifier must fall to the general search, and this list only ever moves a
 * query *out* of that default.
 *
 * Normalized on the way in (lowercase, no diacritics), so callers must
 * normalize too — use `isGivenName`.
 */
const NAMES = [
  // — English / international, men —
  "aaron","adam","adrian","alan","albert","alex","alexander","alfred","allen","andrew","andy",
  "anthony","antony","arthur","barry","benedict","benjamin","bernard","bill","blake","bob",
  "brad","bradley","brandon","brendan","brent","brett","brian","bruce","bryan","caleb","cameron",
  "carl","charles","charlie","chris","christian","christopher","clive","cody","colin","cormac",
  "craig","curtis","dale","damon","dan","daniel","darren","dave","david","dean","dennis","derek",
  "desmond","devon","dick","don","donald","douglas","dustin","dylan","earl","ed","edgar","edmund",
  "edward","edwin","eli","elliot","elmore","eric","ernest","ethan","eugene","evan","ezra","frank",
  "franklin","fred","frederick","gabriel","gareth","garth","gary","gavin","geoff","geoffrey",
  "george","gerald","gilbert","glen","gordon","graham","grant","greg","gregory","harlan","harold",
  "harry","harvey","hector","henry","herbert","herman","howard","hugh","hunter","ian","irvine",
  "isaac","ivan","jack","jacob","jake","james","jamie","jared","jason","jasper","jay","jeff",
  "jeffrey","jeremy","jerome","jerry","jesse","jim","joe","joel","john","johnny","jon","jonathan",
  "jordan","jose","joseph","josh","joshua","juan","jude","julian","justin","keith","ken","kenneth",
  "kevin","kim","kurt","kyle","lance","larry","laurence","lawrence","lee","leo","leonard","leslie",
  "lewis","liam","lionel","logan","louis","lucas","luke","malcolm","marcus","mark","martin","mason",
  "matt","matthew","maurice","max","michael","micah","mike","miles","mitch","nathan","nathaniel",
  "neal","neil","nelson","nicholas","nick","nigel","noah","norman","oliver","orson","oscar","owen",
  "patrick","paul","percy","pete","peter","philip","phillip","pierce","preston","quentin","ralph",
  "randall","randy","ray","raymond","reginald","rex","richard","rick","ridley","riley","rob",
  "robert","robin","rod","roderick","rodney","roger","roland","ron","ronald","rory","ross","roy",
  "rudyard","rupert","russell","ryan","sam","samuel","scott","sean","sebastian","seth","shane",
  "shaun","shawn","sidney","simon","spencer","stan","stanley","stephen","steve","steven","stuart",
  "ted","terence","terry","theodore","thomas","tim","timothy","tobias","toby","todd","tom","tony",
  "travis","trevor","troy","tyler","victor","vince","vincent","virgil","wade","walter","warren",
  "wayne","wesley","wilbur","wilkie","will","william","wyatt","xavier","zachary","zack",
  // — English / international, women —
  "abigail","ada","adele","agatha","aimee","alexandra","alice","alicia","alison","allison","amanda",
  "amber","amelia","amy","ana","andrea","angela","angie","anita","ann","anna","anne","annette",
  "annie","april","ashley","audrey","ava","barbara","beatrice","becky","belinda","beth","bethany",
  "betty","beverly","bonnie","brenda","bridget","brittany","brooke","camilla","candace","cara",
  "carol","carolina","caroline","carolyn","carrie","cassandra","catherine","cathy","celeste",
  "charlotte","chelsea","cheryl","chloe","christina","christine","cindy","claire","clara","claudia",
  "colleen","connie","constance","courtney","crystal","cynthia","daisy","dana","danielle","daphne",
  "darlene","dawn","deborah","debra","delia","denise","diana","diane","dolores","donna","dora",
  "doris","dorothy","edith","eleanor","elena","elizabeth","ella","ellen","elsie","emily","emma",
  "erica","erin","esther","ethel","eva","evelyn","faith","fay","felicia","fiona","flora","frances",
  "gabriela","gail","gemma","genevieve","georgia","gillian","gina","gladys","gloria","grace",
  "gwen","gwendolyn","hannah","harper","hazel","heather","heidi","helen","helena","hilary","holly",
  "hope","ida","imogen","ingrid","irene","iris","isabel","isabella","ivy","jacqueline","jane",
  "janet","janice","jasmine","jean","jeanne","jenna","jennifer","jenny","jessica","jill","joan",
  "joanna","joanne","jodi","jody","josephine","joy","joyce","judith","judy","julia","julie",
  "juliet","june","karen","karin","kate","katherine","kathleen","kathryn","kathy","katie","kayla",
  "kelly","kendra","kerry","kirsten","kristen","kristin","lara","laura","lauren","laurie","leah",
  "leigh","lena","leslie","lidia","lillian","lily","linda","lindsay","lisa","lois","lora","loretta",
  "lori","louisa","louise","lucia","lucy","lydia","lynn","mabel","madeline","madison","maggie",
  "marcia","margaret","marge","maria","mariana","marianne","marie","marilyn","marion","marissa",
  "marjorie","marlene","marsha","martha","mary","maureen","maya","megan","melanie","melinda",
  "melissa","mercedes","meredith","mia","michelle","mildred","millie","miranda","miriam","molly",
  "monica","nadia","nancy","naomi","natalie","natasha","nell","nicole","nina","nora","norah",
  "olive","olivia","opal","paige","pam","pamela","patricia","patsy","paula","pauline","pearl",
  "peggy","penelope","penny","phoebe","phyllis","polly","priscilla","rachel","rebecca","regina",
  "renee","rhonda","rita","roberta","robyn","rosa","rose","rosemary","ruby","ruth","sabrina",
  "sally","samantha","sandra","sara","sarah","sharon","sheila","shelby","shelley","sherry","shirley",
  "sonia","sophia","sophie","stacey","stella","stephanie","sue","susan","susanna","suzanne","sybil",
  "sylvia","tamara","tammy","tara","teresa","terri","tessa","thelma","theresa","tiffany","tina",
  "toni","tracy","tricia","trudy","ursula","valerie","vanessa","vera","veronica","vicki","victoria",
  "violet","virginia","vivian","wanda","wendy","whitney","willa","wilma","yvonne","zoe",
  // — Spanish / Portuguese / Italian —
  "adriana","agustin","alba","alberto","alejandra","alejandro","alfonso","alicia","almudena",
  "alvaro","amalia","ana","andres","angel","angeles","angelica","antonia","antonio","araceli",
  "arturo","asuncion","aurora","beatriz","begona","benito","bernardo","blanca","camila","carla",
  "carlos","carmen","catalina","cecilia","celia","cesar","clara","claudio","concepcion","consuelo",
  "cristina","cristobal","daniela","diego","dolores","domingo","dulce","eduardo","elena","elisa",
  "eloy","elvira","emilia","emilio","enrique","ernesto","esperanza","esteban","estela","eugenia",
  "eva","fatima","federico","felipe","felix","fernanda","fernando","fidel","filomena","francisca",
  "francisco","gabriel","gabriela","gerardo","gloria","gonzalo","gregorio","guadalupe","guillermo",
  "gustavo","hector","hugo","ignacio","ines","irene","isabel","ismael","jacinto","jaime","javier",
  "jesus","joaquin","jordi","jorge","jose","josefa","josefina","juan","juana","julia","julio",
  "laura","lautaro","leandro","leonor","leticia","lorena","lorenzo","lucia","luciana","luis",
  "luisa","luz","magdalena","manuel","manuela","marcelo","marcos","margarita","maria","mariana",
  "mariano","marina","mario","marta","martin","mateo","matias","mauricio","mercedes","miguel",
  "milagros","mireia","miriam","monica","montserrat","natalia","nicolas","nieves","noelia","norma",
  "nuria","octavio","olga","oriol","oscar","pablo","paloma","paola","patricia","paula","pedro",
  "pilar","rafael","ramon","raquel","raul","ricardo","roberto","rocio","rodrigo","rosa","rosario",
  "ruben","salvador","samuel","sandra","santiago","sara","sergio","silvia","sofia","soledad",
  "sonia","susana","teresa","tomas","valentina","valeria","vicente","victor","victoria","violeta",
  "virginia","ximena","yolanda",
  // — French / German / Nordic / Slavic —
  "agnes","albrecht","aleksandr","alexandre","andre","anders","anton","astrid","bernhard","birgit",
  "bjorn","boris","brigitte","camille","cecile","christiane","christoph","claude","clement",
  "dieter","dmitri","dominique","eduard","emile","erik","ernst","etienne","fabien","florence",
  "francois","franz","frederic","friedrich","georges","gerhard","greta","gunter","gustav","hans",
  "heinrich","helga","henri","herbert","hermann","ingmar","ingrid","irina","isabelle","jacques",
  "jean","jens","joachim","johan","johann","johanna","jurgen","karl","katarina","klaus","lars",
  "laurent","leon","lise","ludwig","lukas","magnus","manfred","marcel","margarethe","marguerite",
  "marie","mathieu","matthias","maxime","michel","mikhail","nadine","nikolai","nils","olaf","olga",
  "otto","pascal","patrice","pierre","rainer","rene","sabine","sergei","sofie","soren","stefan",
  "svetlana","sven","tatiana","thierry","thomas","ulrich","ursula","vladimir","wilhelm","wolfgang",
  "yuri","yves",
  // — Japanese, Chinese, Korean, South Asian, Arabic, African —
  // Not a token gesture: the catalog and the reader base both reach well past
  // Europe, and a Murakami or an Adichie query has the same right to the
  // author search as a King query.
  "abdul","adichie","aiko","akemi","akira","ali","amir","ananya","anil","anjali","arjun","asha",
  "ayesha","aziz","banana","chidi","chimamanda","daiki","deepak","eiji","emeka","fatima","farah",
  "gita","hana","haruki","hassan","hideo","hiroshi","hiromi","ibrahim","ichiro","jin","jing",
  "junichiro","kaori","karim","kazuo","keiko","kenji","khaled","kiran","kofi","kwame","lei","li",
  "ling","mahmoud","makoto","manu","mariam","masaji","meera","mei","min","ming","mohamed","mohammed",
  "nadia","naguib","naoki","ngozi","nnedi","noor","omar","priya","rabindranath","rahul","raj","rana",
  "ravi","riku","rohan","rukmini","ryu","sadia","salman","samira","sanjay","satoshi","sayaka","shan",
  "shin","shoko","shuichi","sunil","tahmima","takashi","tanvir","tariq","toshio","vikram","wei",
  "wole","xiao","yasmin","yoko","yu","yuki","yusuf","zadie","zeinab",
];

const GIVEN_NAMES = new Set(NAMES);

/** Lowercase, strip diacritics — the shape the set is stored in. */
function normalize(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z]/g, "");
}

/** Is this word a common given name? Case- and accent-insensitive. */
export function isGivenName(word: string): boolean {
  return GIVEN_NAMES.has(normalize(word));
}

/** Exposed for the classifier test, which asserts the list stays deduplicated. */
export const GIVEN_NAME_COUNT = GIVEN_NAMES.size;
