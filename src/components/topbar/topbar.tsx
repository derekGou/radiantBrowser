import Searchbar from "./searchbar/searchbar";
import Tabbar from "./tab/tabbar";

export default function Topbar(){

    return (
        <>
            <nav className="h-[6rem] flex flex-col w-full">
                <Tabbar/>
                <Searchbar/>
            </nav>
        </>
    )
}